package com.envsync.util

import com.google.gson.JsonParser
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import java.io.File

object ProjectIdGenerator {
    fun generate(username: String, project: Project): String {
        val baseDir = project.guessProjectDir()
        val projectName = baseDir?.let { readPackageName(it.path) } ?: project.name
        val sanitized = projectName.lowercase()
            .replace(Regex("[^a-z0-9-]"), "-")
            .replace(Regex("-+"), "-")
        return "$username/$sanitized"
    }

    private fun readPackageName(basePath: String): String? {
        val packageJson = File(basePath, "package.json")
        if (!packageJson.exists()) return null
        return try {
            val json = JsonParser.parseString(packageJson.readText()).asJsonObject
            json.get("name")?.asString?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
}
