package com.envsync.util

import com.google.gson.Gson
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import java.io.File

object ProjectConfig {
    private const val CONFIG_FILE = ".envsync.json"
    private val gson = Gson()

    data class EnvSyncConfig(val projectId: String)

    fun getConfigFile(project: Project): File? {
        val baseDir = project.guessProjectDir() ?: return null
        return File(baseDir.path, CONFIG_FILE)
    }

    fun readProjectId(project: Project): String? {
        return try {
            val file = getConfigFile(project) ?: return null
            if (!file.exists()) return null
            val config = gson.fromJson(file.readText(), EnvSyncConfig::class.java)
            config.projectId
        } catch (_: Exception) {
            null
        }
    }

    fun writeProjectId(project: Project, projectId: String) {
        val file = getConfigFile(project) ?: return
        val content = gson.toJson(EnvSyncConfig(projectId))
        file.writeText(content)
    }
}
