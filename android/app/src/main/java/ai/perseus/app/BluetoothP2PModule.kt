package ai.perseus.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
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

class BluetoothP2PModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var serverSocket: BluetoothServerSocket? = null
    private var isServerRunning: Boolean = false
    private var serverThread: Thread? = null

    companion object {
        const val NAME = "BluetoothP2P"
        const val DEFAULT_UUID = "00001101-0000-1000-8000-00805F9B34FB" // SPP Standard UUID
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
            serverSocket = bluetoothAdapter?.listenUsingRfcommWithServiceRecord(sName, uuid)

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
                    // Notificar a React Native mediante evento
                    val params = Arguments.createMap().apply {
                        putString("packetJson", receivedJson)
                        putString("senderAddress", socket.remoteDevice.address)
                        putString("senderName", socket.remoteDevice.name ?: "Nodo-BT")
                    }
                    sendEvent("onBluetoothPacketReceived", params)

                    // Enviar acuse de recibo ACK automático al emisor
                    val ackPayload = """{"type":"ACK","status":"delivered_via_rfcomm","timestamp":${System.currentTimeMillis()},"receiverName":"${bluetoothAdapter?.name ?: "Rescatista"}"}"""
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

                // 1. Buscar dispositivo por dirección MAC o por nombre emparejado
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

                // 2. Cancelar descubrimiento para velocidad máxima de conexión RFCOMM
                bluetoothAdapter.cancelDiscovery()

                // 3. Crear socket y conectar
                clientSocket = device.createRfcommSocketToServiceRecord(uuid)
                clientSocket.connect()

                // 4. Enviar payload delimitado
                val writer = PrintWriter(OutputStreamWriter(clientSocket.outputStream, Charsets.UTF_8))
                writer.println(packetJson)
                writer.println(EOF_DELIMITER)
                writer.flush()

                // 5. Esperar acuse de recibo ACK
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

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Requerido por NativeEventEmitter de React Native
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // Requerido por NativeEventEmitter de React Native
    }
}
