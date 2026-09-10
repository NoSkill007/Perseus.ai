package ai.perseus.app

import android.net.Uri
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

class NearbyP2PModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NearbyP2P"
        const val TAG = "NearbyP2P"
        const val SERVICE_ID = "ai.perseus.app.p2p"
        val STRATEGY: Strategy = Strategy.P2P_CLUSTER
        const val MAX_BYTES_LIMIT = 32768
    }

    private val connectionsClient: ConnectionsClient by lazy {
        Nearby.getConnectionsClient(reactContext)
    }

    private var isAdvertising = false
    private var isDiscovering = false
    private var autoAcceptConnection = true

    // Tracking de endpoints conectados (endpointId -> endpointName)
    private val connectedEndpoints = ConcurrentHashMap<String, String>()

    // Tracking para payloads de archivos y metadata JSON out-of-order
    private val pendingFileMeta = ConcurrentHashMap<Long, JSONObject>()
    private val incomingPayloads = ConcurrentHashMap<Long, Payload>()
    private val completedPayloadIds = ConcurrentHashMap.newKeySet<Long>()

    override fun getName(): String = NAME

    // =========================================================================
    // CALLBACKS DE NEARBY CONNECTIONS
    // =========================================================================

    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, connectionInfo: ConnectionInfo) {
            val endpointName = connectionInfo.endpointName ?: "Desconocido"
            Log.d(TAG, "onConnectionInitiated: id=$endpointId, name=$endpointName, incoming=${connectionInfo.isIncomingConnection}")

            val params = Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("endpointName", endpointName)
                putString("authenticationDigits", connectionInfo.authenticationDigits ?: "")
                putBoolean("isIncoming", connectionInfo.isIncomingConnection)
            }
            sendEvent("onConnectionInitiated", params)

            if (autoAcceptConnection) {
                Log.d(TAG, "Auto-aceptando conexión con $endpointId")
                connectionsClient.acceptConnection(endpointId, payloadCallback)
                    .addOnFailureListener { e ->
                        Log.e(TAG, "Error al auto-aceptar conexión con $endpointId: ${e.message}")
                    }
            }
        }

        override fun onConnectionResult(endpointId: String, resolution: ConnectionResolution) {
            if (resolution.status.statusCode == ConnectionsStatusCodes.STATUS_OK) {
                Log.d(TAG, "onConnectionResult: CONECTADO con éxito a $endpointId")
                val name = connectedEndpoints[endpointId] ?: "Par-Nearby"
                connectedEndpoints[endpointId] = name

                val params = Arguments.createMap().apply {
                    putString("endpointId", endpointId)
                    putString("endpointName", name)
                }
                sendEvent("onConnected", params)
            } else {
                Log.w(TAG, "onConnectionResult: FALLO conexión a $endpointId, código=${resolution.status.statusCode}")
                connectedEndpoints.remove(endpointId)

                val params = Arguments.createMap().apply {
                    putString("endpointId", endpointId)
                    putInt("statusCode", resolution.status.statusCode)
                    putString("statusMessage", resolution.status.statusMessage ?: "Error de conexión")
                }
                sendEvent("onConnectionFailed", params)
            }
        }

        override fun onDisconnected(endpointId: String) {
            Log.d(TAG, "onDisconnected: $endpointId")
            connectedEndpoints.remove(endpointId)

            val params = Arguments.createMap().apply {
                putString("endpointId", endpointId)
            }
            sendEvent("onDisconnected", params)
        }
    }

    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            Log.d(TAG, "onEndpointFound: id=$endpointId, name=${info.endpointName}")

            val params = Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("endpointName", info.endpointName ?: "Nodo")
                putString("serviceId", info.serviceId)
            }
            sendEvent("onEndpointFound", params)
        }

        override fun onEndpointLost(endpointId: String) {
            Log.d(TAG, "onEndpointLost: id=$endpointId")

            val params = Arguments.createMap().apply {
                putString("endpointId", endpointId)
            }
            sendEvent("onEndpointLost", params)
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val payloadId = payload.id
            incomingPayloads[payloadId] = payload

            when (payload.type) {
                Payload.Type.BYTES -> {
                    val bytes = payload.asBytes() ?: ByteArray(0)
                    val rawText = String(bytes, Charsets.UTF_8)

                    // Verificar si es metadata de archivo
                    var isMeta = false
                    try {
                        if (rawText.startsWith("{") && rawText.contains("isNearbyFileMeta")) {
                            val json = JSONObject(rawText)
                            if (json.optBoolean("isNearbyFileMeta", false)) {
                                isMeta = true
                                val targetFilePayloadId = json.optLong("filePayloadId", -1L)
                                if (targetFilePayloadId != -1L) {
                                    pendingFileMeta[targetFilePayloadId] = json

                                    // Si el archivo ya terminó de transferirse antes que la metadata
                                    if (completedPayloadIds.contains(targetFilePayloadId)) {
                                        processCompletedFile(endpointId, targetFilePayloadId, json)
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error parseando posible metadata de archivo: ${e.message}")
                    }

                    if (!isMeta) {
                        val params = Arguments.createMap().apply {
                            putString("endpointId", endpointId)
                            putString("payloadId", payloadId.toString())
                            putString("data", rawText)
                        }
                        sendEvent("onBytesReceived", params)
                    }
                }
                Payload.Type.FILE -> {
                    Log.d(TAG, "onPayloadReceived: Archivo iniciado payloadId=$payloadId desde $endpointId")
                    // Si la metadata llegó antes y el payload ya figuraba como completo
                    if (completedPayloadIds.contains(payloadId) && pendingFileMeta.containsKey(payloadId)) {
                        processCompletedFile(endpointId, payloadId, pendingFileMeta[payloadId]!!)
                    }
                }
                Payload.Type.STREAM -> {
                    Log.d(TAG, "onPayloadReceived: Stream payloadId=$payloadId (no utilizado)")
                }
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            val payloadId = update.payloadId
            val totalBytes = update.totalBytes
            val bytesTransferred = update.bytesTransferred
            val progress = if (totalBytes > 0) bytesTransferred.toDouble() / totalBytes.toDouble() else 0.0

            val progressParams = Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("payloadId", payloadId.toString())
                putDouble("bytesTransferred", bytesTransferred.toDouble())
                putDouble("totalBytes", totalBytes.toDouble())
                putDouble("progress", progress)
                putInt("status", update.status)
            }
            sendEvent("onTransferProgress", progressParams)

            when (update.status) {
                PayloadTransferUpdate.Status.SUCCESS -> {
                    Log.d(TAG, "onPayloadTransferUpdate: SUCCESS payloadId=$payloadId")
                    completedPayloadIds.add(payloadId)

                    val completeParams = Arguments.createMap().apply {
                        putString("endpointId", endpointId)
                        putString("payloadId", payloadId.toString())
                    }
                    sendEvent("onTransferComplete", completeParams)

                    // Si es un archivo recibido, procesarlo y guardarlo
                    if (incomingPayloads.containsKey(payloadId) &&
                        incomingPayloads[payloadId]?.type == Payload.Type.FILE) {
                        if (pendingFileMeta.containsKey(payloadId)) {
                            processCompletedFile(endpointId, payloadId, pendingFileMeta[payloadId]!!)
                        } else {
                            // Crear metadata de fallback si no llegó
                            val fallbackMeta = JSONObject().apply {
                                put("fileName", "received_nearby_${payloadId}")
                            }
                            processCompletedFile(endpointId, payloadId, fallbackMeta)
                        }
                    }
                }
                PayloadTransferUpdate.Status.FAILURE,
                PayloadTransferUpdate.Status.CANCELED -> {
                    Log.w(TAG, "onPayloadTransferUpdate: FALLO payloadId=$payloadId status=${update.status}")
                    val failParams = Arguments.createMap().apply {
                        putString("endpointId", endpointId)
                        putString("payloadId", payloadId.toString())
                        putInt("status", update.status)
                    }
                    sendEvent("onTransferFailed", failParams)

                    incomingPayloads.remove(payloadId)
                    pendingFileMeta.remove(payloadId)
                    completedPayloadIds.remove(payloadId)
                }
            }
        }
    }

    private fun processCompletedFile(endpointId: String, payloadId: Long, metaJson: JSONObject) {
        val payload = incomingPayloads[payloadId] ?: return
        try {
            val uri: Uri? = payload.asFile()?.asUri()
            val originalFileName = metaJson.optString("fileName", "file_${payloadId}")
            val safeName = "nearby_${payloadId}_${originalFileName.replace("[^a-zA-Z0-9._-]".toRegex(), "_")}"

            val targetDir = File(reactContext.cacheDir, "nearby_files")
            if (!targetDir.exists()) {
                targetDir.mkdirs()
            }
            val targetFile = File(targetDir, safeName)

            if (uri != null) {
                reactContext.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(targetFile).use { output ->
                        input.copyTo(output)
                    }
                }
            }

            Log.d(TAG, "processCompletedFile: Guardado en ${targetFile.absolutePath} (${targetFile.length()} bytes)")

            val params = Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("payloadId", payloadId.toString())
                putString("fileUri", "file://${targetFile.absolutePath}")
                putString("fileName", originalFileName)
                putDouble("fileSize", targetFile.length().toDouble())
                putString("metadata", metaJson.toString())
            }
            sendEvent("onFileReceived", params)
        } catch (e: Exception) {
            Log.e(TAG, "Error al procesar archivo recibido: ${e.message}", e)
        } finally {
            incomingPayloads.remove(payloadId)
            pendingFileMeta.remove(payloadId)
            completedPayloadIds.remove(payloadId)
        }
    }

    // =========================================================================
    // MÉTODOS REACT EXPORTADOS
    // =========================================================================

    @ReactMethod
    fun isSupported(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun setAutoAccept(enabled: Boolean, promise: Promise) {
        autoAcceptConnection = enabled
        promise.resolve(true)
    }

    @ReactMethod
    fun startAdvertising(displayName: String, promise: Promise) {
        try {
            val name = displayName.ifEmpty { "Perseus-Node" }
            val options = AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build()

            connectionsClient.startAdvertising(name, SERVICE_ID, connectionLifecycleCallback, options)
                .addOnSuccessListener {
                    isAdvertising = true
                    Log.d(TAG, "startAdvertising: Activo como '$name'")
                    promise.resolve(true)
                }
                .addOnFailureListener { e ->
                    isAdvertising = false
                    Log.e(TAG, "startAdvertising fallo: ${e.message}", e)
                    promise.reject("ERR_START_ADV", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_START_ADV_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        try {
            connectionsClient.stopAdvertising()
            isAdvertising = false
            Log.d(TAG, "stopAdvertising: Detenido")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_ADV", e.message, e)
        }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            val options = DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build()

            connectionsClient.startDiscovery(SERVICE_ID, endpointDiscoveryCallback, options)
                .addOnSuccessListener {
                    isDiscovering = true
                    Log.d(TAG, "startDiscovery: Buscando en cluster...")
                    promise.resolve(true)
                }
                .addOnFailureListener { e ->
                    isDiscovering = false
                    Log.e(TAG, "startDiscovery fallo: ${e.message}", e)
                    promise.reject("ERR_START_DISC", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_START_DISC_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            connectionsClient.stopDiscovery()
            isDiscovering = false
            Log.d(TAG, "stopDiscovery: Detenido")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_DISC", e.message, e)
        }
    }

    @ReactMethod
    fun requestConnection(endpointId: String, displayName: String, promise: Promise) {
        try {
            val name = displayName.ifEmpty { "Perseus-Node" }
            connectedEndpoints[endpointId] = name

            connectionsClient.requestConnection(name, endpointId, connectionLifecycleCallback)
                .addOnSuccessListener {
                    Log.d(TAG, "requestConnection: Solicitud enviada a $endpointId")
                    promise.resolve(true)
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "requestConnection fallo: ${e.message}", e)
                    promise.reject("ERR_REQ_CONN", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_REQ_CONN_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun acceptConnection(endpointId: String, promise: Promise) {
        try {
            connectionsClient.acceptConnection(endpointId, payloadCallback)
                .addOnSuccessListener {
                    Log.d(TAG, "acceptConnection: Aceptada para $endpointId")
                    promise.resolve(true)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR_ACCEPT_CONN", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_ACCEPT_CONN_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun rejectConnection(endpointId: String, promise: Promise) {
        try {
            connectionsClient.rejectConnection(endpointId)
                .addOnSuccessListener {
                    connectedEndpoints.remove(endpointId)
                    promise.resolve(true)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR_REJECT_CONN", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_REJECT_CONN_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun disconnect(endpointId: String, promise: Promise) {
        try {
            connectionsClient.disconnectFromEndpoint(endpointId)
            connectedEndpoints.remove(endpointId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DISCONNECT", e.message, e)
        }
    }

    @ReactMethod
    fun disconnectAll(promise: Promise) {
        try {
            connectionsClient.stopAllEndpoints()
            connectedEndpoints.clear()
            isAdvertising = false
            isDiscovering = false
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DISCONNECT_ALL", e.message, e)
        }
    }

    @ReactMethod
    fun sendBytes(endpointId: String, data: String, promise: Promise) {
        try {
            val bytes = data.toByteArray(Charsets.UTF_8)
            if (bytes.size > MAX_BYTES_LIMIT) {
                promise.reject(
                    "ERR_PAYLOAD_TOO_LARGE",
                    "BYTES payload excede el límite de 32KB (${bytes.size} bytes). Usa sendFile para transferencias grandes."
                )
                return
            }

            val payload = Payload.fromBytes(bytes)
            val payloadId = payload.id

            connectionsClient.sendPayload(endpointId, payload)
                .addOnSuccessListener {
                    val res = Arguments.createMap().apply {
                        putBoolean("success", true)
                        putString("payloadId", payloadId.toString())
                        putInt("bytes", bytes.size)
                    }
                    promise.resolve(res)
                }
                .addOnFailureListener { e ->
                    promise.reject("ERR_SEND_BYTES", e.message, e)
                }
        } catch (e: Exception) {
            promise.reject("ERR_SEND_BYTES_EXP", e.message, e)
        }
    }

    @ReactMethod
    fun sendFile(endpointId: String, filePath: String, metadataJson: String, promise: Promise) {
        Thread {
            try {
                val cleanPath = if (filePath.startsWith("file://")) filePath.substring(7) else filePath
                val file = File(cleanPath)
                if (!file.exists()) {
                    promise.reject("ERR_FILE_NOT_FOUND", "Archivo no encontrado en: $cleanPath")
                    return@Thread
                }

                val filePayload = Payload.fromFile(file)
                val payloadId = filePayload.id

                // Construir metadata JSON que acompaña al archivo
                val metaObj = try {
                    JSONObject(metadataJson)
                } catch (e: Exception) {
                    JSONObject()
                }
                metaObj.put("isNearbyFileMeta", true)
                metaObj.put("filePayloadId", payloadId)
                metaObj.put("fileName", file.name)
                metaObj.put("fileSize", file.length())

                val metaBytes = metaObj.toString().toByteArray(Charsets.UTF_8)
                val metaPayload = Payload.fromBytes(metaBytes)

                // 1. Enviar metadata BYTES primero
                connectionsClient.sendPayload(endpointId, metaPayload)
                    .addOnSuccessListener {
                        // 2. Enviar el archivo binario
                        connectionsClient.sendPayload(endpointId, filePayload)
                            .addOnSuccessListener {
                                val res = Arguments.createMap().apply {
                                    putBoolean("success", true)
                                    putString("payloadId", payloadId.toString())
                                    putString("fileName", file.name)
                                    putDouble("fileSize", file.length().toDouble())
                                }
                                promise.resolve(res)
                            }
                            .addOnFailureListener { e ->
                                promise.reject("ERR_SEND_FILE", "Fallo al enviar FILE: ${e.message}", e)
                            }
                    }
                    .addOnFailureListener { e ->
                        promise.reject("ERR_SEND_FILE_META", "Fallo al enviar metadata de FILE: ${e.message}", e)
                    }
            } catch (e: Exception) {
                promise.reject("ERR_SEND_FILE_EXP", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun getConnectedEndpoints(promise: Promise) {
        try {
            val array: WritableArray = Arguments.createArray()
            for ((id, name) in connectedEndpoints) {
                val map: WritableMap = Arguments.createMap().apply {
                    putString("endpointId", id)
                    putString("endpointName", name)
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("ERR_GET_ENDPOINTS", e.message, e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("isAdvertising", isAdvertising)
            putBoolean("isDiscovering", isDiscovering)
            putInt("connectedCount", connectedEndpoints.size)
        }
        promise.resolve(map)
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
