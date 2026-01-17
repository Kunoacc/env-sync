package com.envsync.util

import com.envsync.settings.EnvSyncSettingsState
import com.intellij.openapi.components.service
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EnvFileFinderTest : BasePlatformTestCase() {
    fun testFindsEnvFilesWithWildcardPatterns() {
        val tempDir = myFixture.tempDirFixture
        val root = tempDir.findOrCreateDir("config")
        val envFile = tempDir.createFile(".env", "HELLO=world")
        val appSettings = tempDir.createFile("appsettings.Development.json", "{}")
        val configExs = tempDir.createFile("config/dev.exs", "")

        val settingsState = service<EnvSyncSettingsState>()
        settingsState.state.filePatterns = mutableListOf(
            ".env",
            "appsettings.*.json",
            "config/*.exs"
        )

        val files = EnvFileFinder.findEnvFiles(project)
        val paths = files.map { it.path }

        assertTrue(paths.contains(envFile.path))
        assertTrue(paths.contains(appSettings.path))
        assertTrue(paths.contains(configExs.path))
        assertFalse(paths.contains(root.path))
    }
}
