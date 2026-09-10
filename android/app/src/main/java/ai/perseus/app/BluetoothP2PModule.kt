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
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.io.PrintWriter
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
            httpServer = java.net.ServerSocket(listenPort)
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
                socket.soTimeout = 12000
                val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
                val out = PrintWriter(OutputStreamWriter(socket.getOutputStream(), Charsets.UTF_8))

                var contentLength = 0
                var line: String?

                // 1. Leer cabeceras HTTP
                while (reader.readLine().also { line = it } != null) {
                    if (line.isNullOrEmpty()) break
                    val lower = line!!.lowercase()
                    if (lower.startsWith("content-length:")) {
                        contentLength = lower.substringAfter("content-length:").trim().toIntOrNull() ?: 0
                    }
                }

                // 2. Leer cuerpo de la petición (JSON)
                val body = if (contentLength > 0) {
                    val buffer = CharArray(contentLength)
                    var readTotal = 0
                    while (readTotal < contentLength) {
                        val read = reader.read(buffer, readTotal, contentLength - readTotal)
                        if (read == -1) break
                        readTotal += read
                    }
                    String(buffer, 0, readTotal)
                } else {
                    val sb = StringBuilder()
                    while (reader.ready() && reader.readLine().also { line = it } != null) {
                        sb.append(line).append("\n")
                    }
                    sb.toString().trim()
                }

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

                    out.print("HTTP/1.1 200 OK\r\n")
                    out.print("Content-Type: application/json; charset=utf-8\r\n")
                    out.print("Content-Length: ${ackBytes.size}\r\n")
                    out.print("Connection: close\r\n")
                    out.print("\r\n")
                    out.print(ackBody)
                    out.flush()
                } else {
                    out.print("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
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
