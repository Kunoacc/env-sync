package com.envsync.util

import com.intellij.util.messages.Topic

interface AuthStateListener {
    fun authStateChanged()
}

interface HistoryListener {
    fun historyChanged()
}

object EnvSyncTopics {
    val AUTH_STATE = Topic.create("EnvSyncAuthState", AuthStateListener::class.java)
    val HISTORY = Topic.create("EnvSyncHistory", HistoryListener::class.java)
}
