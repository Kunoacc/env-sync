package com.envsync.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.components.service
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent

class EnvSyncConfigurable : Configurable {
    private val apiUrlField = JBTextField()
    private val filePatternsField = JBTextField()
    private val autoSyncCheckBox = JBCheckBox("Enable auto-sync")

    private var component: JComponent? = null

    override fun getDisplayName(): String = "EnvSync"

    override fun createComponent(): JComponent {
        if (component == null) {
            component = FormBuilder.createFormBuilder()
                .addLabeledComponent("API URL", apiUrlField)
                .addLabeledComponent("File patterns (comma-separated)", filePatternsField)
                .addComponent(autoSyncCheckBox)
                .panel
        }
        return component as JComponent
    }

    override fun isModified(): Boolean {
        val settings = service<EnvSyncSettingsState>().state
        val patterns = parsePatterns(filePatternsField.text)
        return apiUrlField.text != settings.apiUrl ||
            patterns != settings.filePatterns ||
            autoSyncCheckBox.isSelected != settings.autoSync
    }

    override fun apply() {
        val settings = service<EnvSyncSettingsState>().state
        settings.apiUrl = apiUrlField.text.trim()
        settings.filePatterns = parsePatterns(filePatternsField.text).toMutableList()
        settings.autoSync = autoSyncCheckBox.isSelected
    }

    override fun reset() {
        val settings = service<EnvSyncSettingsState>().state
        apiUrlField.text = settings.apiUrl
        filePatternsField.text = settings.filePatterns.joinToString(", ")
        autoSyncCheckBox.isSelected = settings.autoSync
    }

    private fun parsePatterns(input: String): List<String> {
        return input.split(",")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .distinct()
    }
}
