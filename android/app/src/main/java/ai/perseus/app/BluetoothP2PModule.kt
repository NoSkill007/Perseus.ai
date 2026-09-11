package ai.perseus.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.os.ParcelUuid
import android.content.Context
import android.net.wifi.WifiManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import kotlin.math.pow

class BluetoothP2PModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    // Servidor y Cliente RFCOMM (Canal Punto a Punto)
    private var serverSocket: BluetoothServerSocket? = null
    private var isServerRunning: Boolean = false
    private var serverThread: Thread? = null

    // Servidor HTTP P2P Nativo (Wi-Fi Hotspot / Red Local en puerto 7890)
    private var httpServer: java.net.ServerSocket? = null
    private var isHttpServerRunning: Boolean = false
    private var httpServerThread: Thread? = null

    // Balizas y Radar BLE estilo AirTag (Broadcast sin conexión)
    private var leAdvertiser: BluetoothLeAdvertiser? = null
    private var leScanner: BluetoothLeScanner? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null
    private var isAdvertising: Boolean = false
    private var isScanning: Boolean = false

    companion object {
        const val NAME = "BluetoothP2P"
        const val DEFAULT_UUID = "00001101-0000-1000-8000-00805F9B34FB" // SPP Standard UUID
        const val PERSEUS_BLE_UUID = "0000FD01-0000-1000-8000-00805F9B34FB" // Perseus SOS Beacon UUID
        const val EOF_DELIMITER = "---PERSEUS_EOF---"
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun isBluetoothAvailable(promise: Promise) {
        promise.resolve(bluetoothAdapter != null)
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        val enabled = bluetoothAdapter?.isEnabled == true
        promise.resolve(enabled)
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun getPairedDevices(promise: Promise) {
        try {
            if (bluetoothAdapter == null) {
                promise.reject("ERR_NO_BT", "El dispositivo no soporta Bluetooth")
                return
            }

            val array: WritableArray = Arguments.createArray()
            val bondedDevices: Set<BluetoothDevice>? = bluetoothAdapter.bondedDevices

            bondedDevices?.forEach { device ->
                val map: WritableMap = Arguments.createMap()
                map.putString("name", device.name ?: "Dispositivo Desconocido")
                map.putString("address", device.address)
                array.pushMap(map)
            }

            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("ERR_GET_DEVICES", e.message, e)
        }
    }

    // =========================================================================
    // SERVIDOR Y CLIENTE RFCOMM (Transferencia de Reporte Completo)
    // =========================================================================

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startServer(serviceName: String, uuidStr: String, promise: Promise) {
        if (isServerRunning) {
            promise.resolve(true)
            return
        }

        try {
            val uuid = try {
                UUID.fromString(uuidStr.ifEmpty { DEFAULT_UUID })
            } catch (e: Exception) {
                UUID.fromString(DEFAULT_UUID)
            }

            val sName = serviceName.ifEmpty { "PerseusRescue" }
            serverSocket = try {
                bluetoothAdapter?.listenUsingInsecureRfcommWithServiceRecord(sName, uuid)
            } catch (e: Exception) {
                bluetoothAdapter?.listenUsingRfcommWithServiceRecord(sName, uuid)
            }

            if (serverSocket == null) {
                promise.reject("ERR_SERVER_NULL", "No se pudo crear el BluetoothServerSocket")
                return
            }

            isServerRunning = true
            serverThread = Thread {
                while (isServerRunning) {
                    var clientSocket: BluetoothSocket? = null
                    try {
                        clientSocket = serverSocket?.accept()
                    } catch (e: Exception) {
                        if (!isServerRunning) break
                    }

                    if (clientSocket != null) {
                        handleClientConnection(clientSocket)
                    }
                }
            }.apply {
                name = "Perseus-BT-Server"
                isDaemon = true
                start()
            }

            promise.resolve(true)
        } catch (e: Exception) {
            isServerRunning = false
            promise.reject("ERR_START_SERVER", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun handleClientConnection(socket: BluetoothSocket) {
        Thread {
            try {
                val reader = BufferedReader(InputStreamReader(socket.inputStream, Charsets.UTF_8))
                val sb = StringBuilder()
                var line: String?

                while (reader.readLine().also { line = it } != null) {
                    if (line == EOF_DELIMITER) break
                    sb.append(line).append("\n")
                }

                val receivedJson = sb.toString().trim()

                if (receivedJson.isNotEmpty()) {
                    val params = Arguments.createMap().apply {
                        putString("packetJson", receivedJson)
                        putString("senderAddress", socket.remoteDevice.address)
                        putString("senderName", socket.remoteDevice.name ?: "Nodo-BT")
                    }
                    sendEvent("onBluetoothPacketReceived", params)

                    val packetIdRegex = """"packetId"\s*:\s*"([^"]+)"""".toRegex()
                    val match = packetIdRegex.find(receivedJson)
                    val inResponseTo = match?.groupValues?.get(1) ?: ""

                    val ackPayload = """{"type":"ACK","status":"delivered_via_rfcomm","ackPacketId":"$inResponseTo","timestamp":${System.currentTimeMillis()},"receiverName":"${bluetoothAdapter?.name ?: "Rescatista"}"}"""
                    val writer = PrintWriter(OutputStreamWriter(socket.outputStream, Charsets.UTF_8))
                    writer.println(ackPayload)
                    writer.println(EOF_DELIMITER)
                    writer.flush()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                try {
                    socket.close()
                } catch (e: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            isServerRunning = false
            serverSocket?.close()
            serverSocket = null
            serverThread?.interrupt()
            serverThread = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_SERVER", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun sendPacket(
        targetAddressOrName: String,
        uuidStr: String,
        packetJson: String,
        timeoutMs: Double,
        promise: Promise
    ) {
        Thread {
            var clientSocket: BluetoothSocket? = null
            try {
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                    promise.reject("ERR_BT_OFF", "Bluetooth está desactivado")
                    return@Thread
                }

                val device: BluetoothDevice? = if (BluetoothAdapter.checkBluetoothAddress(targetAddressOrName)) {
                    bluetoothAdapter.getRemoteDevice(targetAddressOrName)
                } else {
                    bluetoothAdapter.bondedDevices?.find {
                        it.name.equals(targetAddressOrName, ignoreCase = true) ||
                        it.address.equals(targetAddressOrName, ignoreCase = true)
                    }
                }

                if (device == null) {
                    promise.reject(
                        "ERR_DEVICE_NOT_FOUND",
                        "Dispositivo Bluetooth '$targetAddressOrName' no encontrado en dispositivos emparejados. Asegúrate de emparejarlos en Ajustes."
                    )
                    return@Thread
                }

                val uuid = try {
                    UUID.fromString(uuidStr.ifEmpty { DEFAULT_UUID })
                } catch (e: Exception) {
                    UUID.fromString(DEFAULT_UUID)
                }

                bluetoothAdapter.cancelDiscovery()

                // Intentar primero socket RFCOMM inseguro (sin emparejamiento obligatorio)
                // con fallback a socket RFCOMM seguro estándar
                clientSocket = try {
                    device.createInsecureRfcommSocketToServiceRecord(uuid).apply { connect() }
                } catch (eInsecure: Exception) {
                    device.createRfcommSocketToServiceRecord(uuid).apply { connect() }
                }

                val writer = PrintWriter(OutputStreamWriter(clientSocket.outputStream, Charsets.UTF_8))
                writer.println(packetJson)
                writer.println(EOF_DELIMITER)
                writer.flush()

                val reader = BufferedReader(InputStreamReader(clientSocket.inputStream, Charsets.UTF_8))
                val sb = StringBuilder()
                var line: String?

                while (reader.readLine().also { line = it } != null) {
                    if (line == EOF_DELIMITER) break
                    sb.append(line).append("\n")
                }

                val ackResponse = sb.toString().trim()
                val bytesCount = packetJson.toByteArray(Charsets.UTF_8).size.toDouble()

                val res = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("responseJson", ackResponse)
                    putDouble("bytes", bytesCount)
                    putString("peerAddress", device.address)
                    putString("peerName", device.name ?: "Rescatista")
                }

                promise.resolve(res)
            } catch (e: Exception) {
                promise.reject("ERR_SEND_BT", "Error de conexión Bluetooth: ${e.message}", e)
            } finally {
                try {
                    clientSocket?.close()
                } catch (e: Exception) {}
            }
        }.start()
    }

    // =========================================================================
    // SERVIDOR HTTP NATIVO P2P (Wi-Fi Hotspot / Red Local en Puerto 7890)
    // =========================================================================

    @ReactMethod
    fun startHttpServer(port: Double, promise: Promise) {
        if (isHttpServerRunning) {
            promise.resolve(true)
            return
        }

        try {
            val listenPort = if (port.toInt() in 1024..65535) port.toInt() else 7890
            val server = java.net.ServerSocket()
            server.reuseAddress = true
            server.bind(java.net.InetSocketAddress(listenPort))
            httpServer = server
            isHttpServerRunning = true

            httpServerThread = Thread {
                while (isHttpServerRunning) {
                    var client: java.net.Socket? = null
                    try {
                        client = httpServer?.accept()
                    } catch (e: Exception) {
                        if (!isHttpServerRunning) break
                    }

                    if (client != null) {
                        handleHttpClient(client)
                    }
                }
            }.apply {
                name = "Perseus-HTTP-Server"
                isDaemon = true
                start()
            }

            println("[BluetoothP2P] Servidor HTTP nativo activo en puerto $listenPort")
            promise.resolve(true)
        } catch (e: Exception) {
            isHttpServerRunning = false
            promise.reject("ERR_HTTP_SERVER", e.message, e)
        }
    }

    private fun handleHttpClient(socket: java.net.Socket) {
        Thread {
            try {
                socket.soTimeout = 10000
                val inStream = java.io.BufferedInputStream(socket.getInputStream())
                val out = java.io.BufferedOutputStream(socket.getOutputStream())

                var contentLength = 0
                var method = "POST"
                var isFirstLine = true

                val headerLine = ByteArrayOutputStream()
                while (true) {
                    val b = inStream.read()
                    if (b == -1) break
                    if (b == '\n'.code) {
                        val line = headerLine.toString("UTF-8").trim()
                        headerLine.reset()
                        if (line.isEmpty()) {
                            break
                        }
                        if (isFirstLine) {
                            method = line.split(" ").firstOrNull()?.uppercase() ?: "POST"
                            isFirstLine = false
                        }
                        val lower = line.lowercase()
                        if (lower.startsWith("content-length:")) {
                            contentLength = lower.substringAfter("content-length:").trim().toIntOrNull() ?: 0
                        }
                    } else if (b != '\r'.code) {
                        headerLine.write(b)
                    }
                }

                // Manejo de preflight CORS (OPTIONS)
                if (method == "OPTIONS") {
                    val corsResp = "HTTP/1.1 204 No Content\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n" +
                            "Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Perseus-Version\r\n" +
                            "Connection: close\r\n\r\n"
                    out.write(corsResp.toByteArray(Charsets.UTF_8))
                    out.flush()
                    return@Thread
                }

                // Manejo de GET (diagnóstico desde navegador o ping)
                if (method == "GET") {
                    val getBody = """{"status":"online","service":"Perseus.ai P2P Server","port":7890,"timestamp":${System.currentTimeMillis()}}"""
                    val getBytes = getBody.toByteArray(Charsets.UTF_8)
                    val getResp = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: application/json; charset=utf-8\r\n" +
                            "Content-Length: ${getBytes.size}\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Connection: close\r\n\r\n"
                    out.write(getResp.toByteArray(Charsets.UTF_8))
                    out.write(getBytes)
                    out.flush()
                    return@Thread
                }

                // 2. Leer cuerpo de la petición (JSON) EXACTAMENTE en bytes (evita bug de UTF-8 con tildes)
                val bodyBytes = if (contentLength > 0) {
                    val buf = ByteArray(contentLength)
                    var readTotal = 0
                    while (readTotal < contentLength) {
                        val read = inStream.read(buf, readTotal, contentLength - readTotal)
                        if (read == -1) break
                        readTotal += read
                    }
                    if (readTotal == contentLength) buf else buf.copyOf(readTotal)
                } else {
                    val bodyStream = ByteArrayOutputStream()
                    val temp = ByteArray(2048)
                    var count = 0
                    while (inStream.available() > 0 && count < 1048576) {
                        val read = inStream.read(temp)
                        if (read == -1) break
                        bodyStream.write(temp, 0, read)
                        count += read
                    }
                    bodyStream.toByteArray()
                }

                val body = String(bodyBytes, Charsets.UTF_8).trim()

                if (body.isNotEmpty()) {
                    val clientIp = socket.inetAddress?.hostAddress ?: "192.168.43.x"
                    val params = Arguments.createMap().apply {
                        putString("packetJson", body)
                        putString("senderAddress", clientIp)
                        putString("senderName", "Nodo-WiFi ($clientIp)")
                    }
                    sendEvent("onBluetoothPacketReceived", params)

                    val packetIdRegex = """"packetId"\s*:\s*"([^"]+)"""".toRegex()
                    val match = packetIdRegex.find(body)
                    val inResponseTo = match?.groupValues?.get(1) ?: ""

                    val ackBody = """{"success":true,"type":"ACK","status":"delivered_via_wifi","ackPacketId":"$inResponseTo","timestamp":${System.currentTimeMillis()},"receiverName":"${bluetoothAdapter?.name ?: "Rescatista"}"}"""
                    val ackBytes = ackBody.toByteArray(Charsets.UTF_8)

                    val responseHeaders = "HTTP/1.1 200 OK\r\n" +
                            "Content-Type: application/json; charset=utf-8\r\n" +
                            "Content-Length: ${ackBytes.size}\r\n" +
                            "Access-Control-Allow-Origin: *\r\n" +
                            "Connection: close\r\n\r\n"

                    out.write(responseHeaders.toByteArray(Charsets.UTF_8))
                    out.write(ackBytes)
                    out.flush()
                } else {
                    val badReq = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    out.write(badReq.toByteArray(Charsets.UTF_8))
                    out.flush()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                try {
                    socket.close()
                } catch (e: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun stopHttpServer(promise: Promise) {
        try {
            isHttpServerRunning = false
            httpServer?.close()
            httpServer = null
            httpServerThread?.interrupt()
            httpServerThread = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_HTTP", e.message, e)
        }
    }

    @ReactMethod
    fun getLocalIpAddress(promise: Promise) {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            var fallbackIp = "192.168.43.1"
            var hotspotIp: String? = null
            var wifiIp: String? = null

            for (itf in interfaces) {
                if (itf.isLoopback || !itf.isUp) continue
                val addresses = itf.inetAddresses
                for (addr in addresses) {
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val ip = addr.hostAddress ?: continue
                        val name = itf.name.lowercase()
                        if (name.contains("ap") || name.contains("softap") || name.contains("swlan") || name.contains("tether")) {
                            hotspotIp = ip
                        } else if (name.contains("wlan") || name.contains("rndis")) {
                            if (wifiIp == null) wifiIp = ip
                        }
                    }
                }
            }

            promise.resolve(hotspotIp ?: wifiIp ?: fallbackIp)
        } catch (e: Exception) {
            promise.resolve("192.168.43.1")
        }
    }

    @ReactMethod
    fun getGatewayIpAddress(promise: Promise) {
        try {
            val wifiManager = reactContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val dhcpInfo = wifiManager?.dhcpInfo
            if (dhcpInfo != null && dhcpInfo.gateway != 0) {
                val ipInt = dhcpInfo.gateway
                val ip = String.format(
                    java.util.Locale.US,
                    "%d.%d.%d.%d",
                    ipInt and 0xff,
                    ipInt shr 8 and 0xff,
                    ipInt shr 16 and 0xff,
                    ipInt shr 24 and 0xff
                )
                promise.resolve(ip)
                return
            }
            promise.resolve("192.168.43.1")
        } catch (e: Exception) {
            promise.resolve("192.168.43.1")
        }
    }

    // =========================================================================
    // MODO BALIZA BLE ESTILO AIRTAG (BROADCAST SIN EMPAREJAMIENTO)
    // =========================================================================

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startBleBeacon(priorityCode: Int, peopleCount: Int, reportIdShort: String, promise: Promise) {
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                promise.reject("ERR_BT_OFF", "Bluetooth no está activado")
                return
            }

            leAdvertiser = bluetoothAdapter.bluetoothLeAdvertiser
            if (leAdvertiser == null) {
                promise.reject("ERR_NO_ADVERTISER", "Este dispositivo no soporta BLE Advertising")
                return
            }

            stopBleBeaconInternal()

            val pUuid = ParcelUuid.fromString(PERSEUS_BLE_UUID)

            // Empaquetar payload binario compacto (12 bytes)
            val payload = ByteArray(12)
            payload[0] = 0x50.toByte() // 'P'
            payload[1] = 0x01.toByte() // Versión 1
            payload[2] = (priorityCode and 0xFF).toByte()
            val safeCount = if (peopleCount in 1..255) peopleCount else 1
            payload[3] = (safeCount and 0xFF).toByte()

            val cleanId = reportIdShort.replace("-", "").take(8).padEnd(8, '0')
            val idBytes = cleanId.toByteArray(Charsets.US_ASCII)
            for (i in 0 until 8) {
                payload[4 + i] = if (i < idBytes.size) idBytes[i] else 0
            }

            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0)
                .build()

            val data = AdvertiseData.Builder()
                .addServiceUuid(pUuid)
                .addServiceData(pUuid, payload)
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(true)
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                    isAdvertising = true
                    println("[BluetoothP2P] Baliza BLE AirTag emitida con éxito al éter")
                }

                override fun onStartFailure(errorCode: Int) {
                    isAdvertising = false
                    println("[BluetoothP2P] Error al emitir baliza BLE: $errorCode")
                }
            }

            leAdvertiser?.startAdvertising(settings, data, advertiseCallback)
            isAdvertising = true

            val res = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("status", "advertising")
                putString("uuid", PERSEUS_BLE_UUID)
            }
            promise.resolve(res)
        } catch (e: Exception) {
            isAdvertising = false
            promise.reject("ERR_BLE_ADV", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun stopBleBeacon(promise: Promise) {
        try {
            stopBleBeaconInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_ADV", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopBleBeaconInternal() {
        if (isAdvertising && leAdvertiser != null && advertiseCallback != null) {
            leAdvertiser?.stopAdvertising(advertiseCallback)
            advertiseCallback = null
            isAdvertising = false
        }
    }

    // =========================================================================
    // RADAR DE PROXIMIDAD BLE (RECEPTOR RESCATISTA CON RSSI Y DISTANCIA)
    // =========================================================================

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startBleRadar(promise: Promise) {
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                promise.reject("ERR_BT_OFF", "Bluetooth no está activado")
                return
            }

            leScanner = bluetoothAdapter.bluetoothLeScanner
            if (leScanner == null) {
                promise.reject("ERR_NO_SCANNER", "Este dispositivo no soporta BLE Scanner")
                return
            }

            stopBleRadarInternal()

            val pUuid = ParcelUuid.fromString(PERSEUS_BLE_UUID)
            val filter = ScanFilter.Builder()
                .setServiceUuid(pUuid)
                .build()

            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .setReportDelay(0)
                .build()

            scanCallback = object : ScanCallback() {
                override fun onScanResult(callbackType: Int, result: ScanResult?) {
                    if (result == null) return
                    val record = result.scanRecord ?: return
                    val serviceData = record.getServiceData(pUuid) ?: return

                    if (serviceData.size >= 4 && serviceData[0] == 0x50.toByte()) {
                        val priorityCode = serviceData[2].toInt() and 0xFF
                        val peopleCount = serviceData[3].toInt() and 0xFF
                        val idBytes = if (serviceData.size >= 12) serviceData.copyOfRange(4, 12) else ByteArray(0)
                        val reportIdShort = String(idBytes, Charsets.US_ASCII).trim('\u0000')

                        val rssi = result.rssi
                        // En BLE, el RSSI calibrado estándar a 1 metro de distancia es -59 dBm.
                        // Usar record.txPowerLevel produce distancias erróneas (>1000m) porque reporta la potencia del chip en antena y no el RSSI recibido a 1m.
                        val measuredPower1m = -59.0
                        val pathLossExponent = 2.2

                        val roundedDistance = if (rssi >= 0) {
                            0.3
                        } else {
                            val ratio = (measuredPower1m - rssi.toDouble()) / (10.0 * pathLossExponent)
                            val rawMeters = 10.0.pow(ratio)
                            val clamped = when {
                                rawMeters < 0.3 -> 0.3
                                rawMeters > 60.0 -> 60.0
                                else -> rawMeters
                            }
                            Math.round(clamped * 10.0) / 10.0
                        }

                        val priorityStr = when (priorityCode) {
                            2 -> "ROJO"
                            1 -> "AMARILLO"
                            3 -> "NEGRO"
                            else -> "VERDE"
                        }

                        val params = Arguments.createMap().apply {
                            putString("deviceAddress", result.device.address)
                            putString("deviceName", result.device.name ?: "Víctima SOS")
                            putString("priority", priorityStr)
                            putInt("peopleCount", if (peopleCount > 0) peopleCount else 1)
                            putString("reportIdShort", reportIdShort)
                            putInt("rssi", rssi)
                            putDouble("distanceMeters", roundedDistance)
                            putDouble("timestamp", System.currentTimeMillis().toDouble())
                        }

                        sendEvent("onBleBeaconDetected", params)
                    }
                }

                override fun onScanFailed(errorCode: Int) {
                    println("[BluetoothP2P] Fallo en escaneo BLE: $errorCode")
                }
            }

            leScanner?.startScan(listOf(filter), settings, scanCallback)
            isScanning = true

            promise.resolve(true)
        } catch (e: Exception) {
            isScanning = false
            promise.reject("ERR_START_RADAR", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun stopBleRadar(promise: Promise) {
        try {
            stopBleRadarInternal()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_RADAR", e.message, e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopBleRadarInternal() {
        if (isScanning && leScanner != null && scanCallback != null) {
            leScanner?.stopScan(scanCallback)
            scanCallback = null
            isScanning = false
        }
    }

    @ReactMethod
    fun convertAudioToWav(inputPath: String, outputPath: String, promise: Promise) {
        Thread {
            try {
                val cleanInput = if (inputPath.startsWith("file://")) inputPath.substring(7) else inputPath
                val cleanOutput = if (outputPath.startsWith("file://")) outputPath.substring(7) else outputPath

                val inputFile = File(cleanInput)
                if (!inputFile.exists()) {
                    promise.reject("ERR_FILE_NOT_FOUND", "Archivo no encontrado: $cleanInput")
                    return@Thread
                }

                // Si ya es un WAV válido (comprobando cabecera RIFF de 4 bytes)
                if (cleanInput.endsWith(".wav", ignoreCase = true)) {
                    val header = ByteArray(4)
                    FileInputStream(inputFile).use { it.read(header) }
                    if (String(header) == "RIFF") {
                        promise.resolve(cleanInput)
                        return@Thread
                    }
                }

                val extractor = MediaExtractor()
                extractor.setDataSource(cleanInput)

                var trackIndex = -1
                var format: MediaFormat? = null
                for (i in 0 until extractor.trackCount) {
                    val f = extractor.getTrackFormat(i)
                    val mime = f.getString(MediaFormat.KEY_MIME) ?: ""
                    if (mime.startsWith("audio/")) {
                        trackIndex = i
                        format = f
                        break
                    }
                }

                if (trackIndex < 0 || format == null) {
                    extractor.release()
                    promise.reject("ERR_NO_AUDIO_TRACK", "No se encontró pista de audio en $cleanInput")
                    return@Thread
                }

                extractor.selectTrack(trackIndex)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
                val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                val channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

                val decoder = MediaCodec.createDecoderByType(mime)
                decoder.configure(format, null, null, 0)
                decoder.start()

                val targetSampleRate = 16000
                val outputFile = File(cleanOutput)
                outputFile.parentFile?.mkdirs()
                if (outputFile.exists()) {
                    outputFile.delete()
                }

                val rawPcmStream = ByteArrayOutputStream()
                val info = MediaCodec.BufferInfo()
                var isEOS = false
                val timeoutUs = 5000L

                while (!Thread.currentThread().isInterrupted) {
                    if (!isEOS) {
                        val inIndex = decoder.dequeueInputBuffer(timeoutUs)
                        if (inIndex >= 0) {
                            val inBuffer = decoder.getInputBuffer(inIndex)
                            if (inBuffer != null) {
                                val sampleSize = extractor.readSampleData(inBuffer, 0)
                                if (sampleSize < 0) {
                                    decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                    isEOS = true
                                } else {
                                    decoder.queueInputBuffer(inIndex, 0, sampleSize, extractor.sampleTime, 0)
                                    extractor.advance()
                                }
                            }
                        }
                    }

                    val outIndex = decoder.dequeueOutputBuffer(info, timeoutUs)
                    if (outIndex >= 0) {
                        val outBuffer = decoder.getOutputBuffer(outIndex)
                        if (outBuffer != null && info.size > 0) {
                            outBuffer.position(info.offset)
                            outBuffer.limit(info.offset + info.size)
                            val chunk = ByteArray(info.size)
                            outBuffer.get(chunk)
                            rawPcmStream.write(chunk)
                        }
                        decoder.releaseOutputBuffer(outIndex, false)
                        if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                            break
                        }
                    } else if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        // Formato confirmado
                    } else if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER && isEOS) {
                        break
                    }
                }

                decoder.stop()
                decoder.release()
                extractor.release()

                val rawPcmBytes = rawPcmStream.toByteArray()
                val shortBuffer = ByteBuffer.wrap(rawPcmBytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                val totalSamples = shortBuffer.remaining()
                val monoSamples = ShortArray(totalSamples / channelCount)

                // 1. Convertir a Mono
                if (channelCount == 1) {
                    shortBuffer.get(monoSamples)
                } else {
                    for (i in monoSamples.indices) {
                        var sum = 0
                        for (c in 0 until channelCount) {
                            if (shortBuffer.hasRemaining()) {
                                sum += shortBuffer.get().toInt()
                            }
                        }
                        monoSamples[i] = (sum / channelCount).toShort()
                    }
                }

                // 2. Resamplear linealmente a 16000 Hz si la tasa difiere
                val targetMonoSamples: ShortArray
                if (sampleRate == targetSampleRate) {
                    targetMonoSamples = monoSamples
                } else {
                    val ratio = sampleRate.toDouble() / targetSampleRate.toDouble()
                    val targetLength = (monoSamples.size / ratio).toInt()
                    targetMonoSamples = ShortArray(targetLength)
                    for (i in 0 until targetLength) {
                        val srcIdx = i * ratio
                        val indexFloor = srcIdx.toInt().coerceIn(0, monoSamples.size - 1)
                        val indexCeil = (indexFloor + 1).coerceIn(0, monoSamples.size - 1)
                        val frac = (srcIdx - indexFloor).toFloat()
                        val interp = (monoSamples[indexFloor] * (1f - frac) + monoSamples[indexCeil] * frac).toInt()
                        targetMonoSamples[i] = interp.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
                    }
                }

                // 3. Escribir archivo WAV estándar de 44 bytes RIFF/WAVE
                val pcmByteCount = targetMonoSamples.size * 2
                val totalDataLen = pcmByteCount + 36
                val fos = FileOutputStream(outputFile)
                val wavHeader = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)

                wavHeader.put("RIFF".toByteArray(Charsets.US_ASCII))
                wavHeader.putInt(totalDataLen)
                wavHeader.put("WAVE".toByteArray(Charsets.US_ASCII))
                wavHeader.put("fmt ".toByteArray(Charsets.US_ASCII))
                wavHeader.putInt(16) // Subchunk1Size
                wavHeader.putShort(1.toShort()) // PCM format
                wavHeader.putShort(1.toShort()) // Mono (1)
                wavHeader.putInt(targetSampleRate) // 16000
                wavHeader.putInt(targetSampleRate * 1 * 2) // ByteRate: 32000
                wavHeader.putShort(2.toShort()) // BlockAlign
                wavHeader.putShort(16.toShort()) // BitsPerSample: 16
                wavHeader.put("data".toByteArray(Charsets.US_ASCII))
                wavHeader.putInt(pcmByteCount)

                fos.write(wavHeader.array())

                val pcmOutputBuffer = ByteBuffer.allocate(targetMonoSamples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
                for (sample in targetMonoSamples) {
                    pcmOutputBuffer.putShort(sample)
                }
                fos.write(pcmOutputBuffer.array())
                fos.flush()
                fos.close()

                promise.resolve(cleanOutput)
            } catch (e: Exception) {
                promise.reject("ERR_CONVERT_WAV", "Fallo en conversión de audio a WAV: ${e.message}", e)
            }
        }.start()
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Double) {}
}
