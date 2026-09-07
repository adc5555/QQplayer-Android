package com.qqplayer.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.qqplayer.core.QqPlayerCorePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(QqPlayerCorePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
