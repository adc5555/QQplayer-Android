package com.qqplayer.core

import android.content.Context
import android.util.Log
import com.getcapacitor.JSObject
import org.json.JSONObject
import java.io.File
import java.net.ServerSocket
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

data class RpcResult(
    val value: JSObject,
    val error: Error?
) {
    fun isOk() = error == null
}

class Error(message: String) : Exception(message)

class NodeRuntime(private val context: Context) {
    private val running = AtomicBoolean(false)
    private val paused = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()
    private val requestId = AtomicInteger(0)
    private val pending = java.util.concurrent.ConcurrentHashMap<Int, (RpcResult) -> Unit>()
    private var port = 0
    private var token = ""

    init {
        System.loadLibrary("qqplayer_node")
    }

    fun start() {
        if (!running.compareAndSet(false, true)) return
        port = findFreePort()
        token = ByteArray(32).also { SecureRandom().nextBytes(it) }
            .joinToString("") { ((it.toInt() and 0xff).toString(16)).padStart(2, '0') }
        val coreDir = File(context.filesDir, "core").apply { mkdirs() }
        val runner = File(coreDir, "runner.js")
        if (!runner.exists()) {
            context.assets.open("runner.js").use { input ->
                runner.outputStream().use { output -> input.copyTo(output) }
            }
        }
        val dataDir = coreDir.absolutePath
        executor.execute {
            val code = nativeStart(port, token, dataDir)
            if (code != 0) Log.e("QQPlayerNode", "node start failed: $code")
        }
    }

    fun pause() {
        paused.set(true)
        nativePause()
    }

    fun resume() {
        paused.set(false)
        nativeResume()
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        nativeStop()
        executor.shutdown()
    }

    fun call(method: String, params: JSObject, callback: (RpcResult) -> Unit) {
        val id = requestId.incrementAndGet()
        pending[id] = callback
        val payload = JSONObject()
            .put("jsonrpc", "2.0")
            .put("id", id)
            .put("method", method)
            .put("params", JSONObject(params.toString()))
            .put("token", token)
        val thread = Thread {
            try {
                val connection = connectWithRetry(port)
                connection.use { socket ->
                    val body = payload.toString()
                    socket.getOutputStream().write("$body\n".toByteArray(StandardCharsets.UTF_8))
                    socket.getOutputStream().flush()
                    val response = socket.getInputStream().bufferedReader(StandardCharsets.UTF_8).readLine()
                    handleResponse(response)
                }
            } catch (error: Exception) {
                handleResponse("""{"jsonrpc":"2.0","id":$id,"error":{"code":-32000,"message":"${error.message}"}}""")
            }
        }
        thread.isDaemon = true
        thread.start()
    }

    private fun connectWithRetry(port: Int): java.net.Socket {
        val deadline = System.currentTimeMillis() + 30_000
        while (true) {
            try {
                return java.net.Socket("127.0.0.1", port)
            } catch (cause: Exception) {
                if (System.currentTimeMillis() >= deadline) throw cause
                Thread.sleep(100)
            }
        }
    }

    private fun handleResponse(raw: String?) {
        if (raw.isNullOrBlank()) return
        val json = JSONObject(raw)
        val id = json.optInt("id")
        val callback = pending.remove(id) ?: return
        if (json.has("error")) {
            val error = json.optJSONObject("error")
            callback(RpcResult(JSObject(), Error(error?.optString("message") ?: "rpc error")))
        } else {
            val wrapper = JSObject()
            wrapper.put("value", if (json.has("result")) json.get("result") else JSONObject.NULL)
            callback(RpcResult(wrapper, null))
        }
    }

    private fun findFreePort(): Int {
        ServerSocket(0).use { return it.localPort }
    }

    private external fun nativeStart(port: Int, token: String, dataDir: String): Int
    private external fun nativePause(): Int
    private external fun nativeResume(): Int
    private external fun nativeStop(): Int
}
