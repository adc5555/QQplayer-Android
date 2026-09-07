package com.qqplayer.core

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QqPlayerCore")
class QqPlayerCorePlugin : Plugin() {
    private lateinit var runtime: NodeRuntime

    override fun load() {
        runtime = NodeRuntime(context)
        runtime.start()
    }

    @PluginMethod
    fun call(call: PluginCall) {
        val method = call.getString("method") ?: return call.reject("missing method")
        val params = call.getObject("params") ?: JSObject()
        runtime.call(method, params) { result ->
            when {
                result.isOk() -> call.resolve(result.value)
                else -> call.reject(result.error?.message ?: "unknown error")
            }
        }
    }

    override fun handleOnPause() {
        runtime.pause()
        super.handleOnPause()
    }

    override fun handleOnResume() {
        runtime.resume()
        super.handleOnResume()
    }

    override fun handleOnDestroy() {
        runtime.stop()
        super.handleOnDestroy()
    }
}
