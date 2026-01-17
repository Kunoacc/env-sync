package com.envsync.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service
@State(name = "EnvSyncSettings", storages = [Storage("envsync.xml")])
class EnvSyncSettingsState : PersistentStateComponent<EnvSyncSettingsState.State> {
    data class State(
        var apiUrl: String = DEFAULT_API_URL,
        var filePatterns: MutableList<String> = mutableListOf(
            ".env",
            ".env.local",
            ".env.development",
            ".envrc",
            "application.properties",
            "application.yml",
            "application.yaml",
            "application-*.properties",
            "application-*.yml",
            "application-*.yaml",
            "appsettings.json",
            "appsettings.*.json",
            "config/*.exs"
        ),
        var autoSync: Boolean = false
    )

    private var state = State()

    override fun getState(): State = state

    override fun loadState(state: State) {
        this.state = state
    }

    companion object {
        const val DEFAULT_API_URL = "https://bryhohgvcdntkgakggzb.supabase.co/functions/v1"
    }
}
