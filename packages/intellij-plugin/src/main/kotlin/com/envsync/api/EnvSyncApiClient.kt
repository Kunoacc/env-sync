package com.envsync.api

import com.envsync.settings.EnvSyncSettingsState
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

@Service
class EnvSyncApiClient {
    private val gson = Gson()
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    private fun apiUrl(): String = service<EnvSyncSettingsState>().state.apiUrl

    fun validateToken(token: String): Boolean {
        val request = baseRequest("/auth/validate", token).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        return response.statusCode() == 200
    }

    fun sendMagicLink(email: String) {
        val body = gson.toJson(mapOf("email" to email))
        val request = baseRequest("/auth/magic-link").POST(HttpRequest.BodyPublishers.ofString(body))
            .header("Content-Type", "application/json")
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) {
            throw RuntimeException(readError(response.body()))
        }
    }

    fun verifyOtp(email: String, token: String): AuthResponse {
        val body = gson.toJson(mapOf("email" to email, "token" to token))
        val request = baseRequest("/auth/verify-otp").POST(HttpRequest.BodyPublishers.ofString(body))
            .header("Content-Type", "application/json")
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) {
            throw RuntimeException(readError(response.body()))
        }
        return gson.fromJson(response.body(), AuthResponse::class.java)
    }

    fun logout(token: String) {
        val request = baseRequest("/auth/logout", token).POST(HttpRequest.BodyPublishers.noBody()).build()
        httpClient.send(request, HttpResponse.BodyHandlers.ofString())
    }

    fun listProjects(token: String): List<Project> {
        val request = baseRequest("/files", token).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) {
            return emptyList()
        }
        val parsed = gson.fromJson(response.body(), ProjectsResponse::class.java)
        return parsed.projects ?: emptyList()
    }

    fun getFile(projectId: String, fileName: String, token: String): FileInfo? {
        val encodedName = urlEncode(fileName)
        val request = baseRequest("/files/$projectId/$encodedName", token).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() == 404) return null
        if (response.statusCode() != 200) throw RuntimeException(readError(response.body()))
        return gson.fromJson(response.body(), FileInfo::class.java)
    }

    fun getFileHistory(projectId: String, fileName: String, token: String): List<FileVersion> {
        val encodedName = urlEncode(fileName)
        val request = baseRequest("/files/$projectId/$encodedName/history", token).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) return emptyList()
        val parsed = gson.fromJson(response.body(), FileHistoryResponse::class.java)
        return parsed.history ?: emptyList()
    }

    fun getFileContent(projectId: String, fileName: String, token: String): FileContentResponse? {
        val encodedName = urlEncode(fileName)
        val request = baseRequest("/files/$projectId/$encodedName/content", token).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() == 404) return null
        if (response.statusCode() != 200) throw RuntimeException(readError(response.body()))
        return gson.fromJson(response.body(), FileContentResponse::class.java)
    }

    fun putFile(projectId: String, fileName: String, content: String, hash: String, token: String) {
        val encodedName = urlEncode(fileName)
        val body = gson.toJson(mapOf("content" to content, "hash" to hash))
        val request = baseRequest("/files/$projectId/$encodedName", token)
            .PUT(HttpRequest.BodyPublishers.ofString(body))
            .header("Content-Type", "application/json")
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) {
            throw RuntimeException(readError(response.body()))
        }
    }

    fun restoreVersion(projectId: String, fileName: String, versionId: String, token: String): RestoreResponse {
        val encodedName = urlEncode(fileName)
        val body = gson.toJson(mapOf("versionId" to versionId))
        val request = baseRequest("/files/$projectId/$encodedName/restore", token)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .header("Content-Type", "application/json")
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() != 200) {
            throw RuntimeException(readError(response.body()))
        }
        return gson.fromJson(response.body(), RestoreResponse::class.java)
    }

    private fun baseRequest(path: String, token: String? = null): HttpRequest.Builder {
        val url = apiUrl().trimEnd('/') + path
        val builder = HttpRequest.newBuilder().uri(URI.create(url))
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        return builder
    }

    private fun urlEncode(value: String): String {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
    }

    private fun readError(body: String): String {
        return try {
            val json = gson.fromJson(body, JsonObject::class.java)
            json.get("message")?.asString
                ?: json.get("error")?.asString
                ?: body
        } catch (_: Exception) {
            body
        }
    }

    data class AuthResponse(val access_token: String, val email: String)
    data class ProjectsResponse(val projects: List<Project>?)
    data class Project(val id: String?, val name: String, val created_at: String?, val updated_at: String?)
    data class FileInfo(val updated_at: String?, val hash: String?)
    data class FileHistoryResponse(val history: List<FileVersion>?)
    data class FileVersion(val id: String, val timestamp: String, val isCurrent: Boolean)
    data class FileContentResponse(val content: String?, val hash: String?)
    data class RestoreResponse(val success: Boolean, val content: String?, val hash: String?)
}
