package com.envsync.services

import com.envsync.api.EnvSyncApiClient
import com.envsync.crypto.EnvSyncCrypto
import com.envsync.crypto.LegacyCrypto
import com.envsync.util.EnvFileFinder
import com.envsync.util.EnvSyncNotifications
import com.envsync.util.EnvSyncTopics
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.time.Instant

@Service(Service.Level.PROJECT)
class EnvSyncHistoryService(private val project: Project) {
    private val api = service<EnvSyncApiClient>()
    private val auth = service<EnvSyncAuthService>()
    private val projectService = service<EnvSyncProjectService>()

    data class FileEntry(
        val fileName: String,
        val lastSynced: Instant?,
        val versions: List<VersionEntry>
    )

    data class VersionEntry(
        val id: String,
        val timestamp: Instant?,
        val isCurrent: Boolean
    )

    fun refresh(callback: (List<FileEntry>) -> Unit) {
        val token = auth.getAccessToken()
        if (token.isNullOrBlank()) {
            callback(emptyList())
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            val projectId = com.envsync.util.ProjectConfig.readProjectId(project) ?: run {
                callback(emptyList())
                return@executeOnPooledThread
            }
            val files = EnvFileFinder.findEnvFiles(project)
            val entries = mutableListOf<FileEntry>()
            for (file in files) {
                val info = runCatching { api.getFile(projectId, file.name, token) }.getOrNull()
                val lastSynced = info?.updated_at?.let { runCatching { Instant.parse(it) }.getOrNull() }
                val history = runCatching { api.getFileHistory(projectId, file.name, token) }.getOrDefault(emptyList())
                val versions = history.map {
                    VersionEntry(
                        id = it.id,
                        timestamp = runCatching { Instant.parse(it.timestamp) }.getOrNull(),
                        isCurrent = it.isCurrent
                    )
                }
                entries.add(FileEntry(file.name, lastSynced, versions))
            }
            callback(entries)
        }
    }

    fun restoreVersion(projectId: String, fileName: String, versionId: String) {
        val token = auth.getAccessToken() ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val response = api.restoreVersion(projectId, fileName, versionId, token)
                if (!response.success) {
                    EnvSyncNotifications.error(project, "Failed to restore version")
                    return@executeOnPooledThread
                }

                val encrypted = response.content ?: return@executeOnPooledThread
                val email = auth.getUserEmail()
                val deviceId = projectService.deviceId()
                val passphrase = EnvSyncCrypto.createPassphrase(email, deviceId)
                val decrypted = if (EnvSyncCrypto.isLegacyFormat(encrypted)) {
                    val legacyKey = EnvSyncCrypto.computeHash("$email-$deviceId-envsync-key")
                    LegacyCrypto.decrypt(encrypted, legacyKey)
                } else {
                    EnvSyncCrypto.decrypt(encrypted, passphrase)
                }

                response.hash?.let {
                    val computed = EnvSyncCrypto.computeHash(decrypted)
                    if (computed != it) {
                        throw IllegalStateException("Integrity check failed: content hash mismatch")
                    }
                }

                projectService.writeFileContent(fileName, decrypted)
                project.messageBus.syncPublisher(EnvSyncTopics.HISTORY).historyChanged()
                EnvSyncNotifications.info(project, "Restored $fileName")
            } catch (error: Exception) {
                EnvSyncNotifications.error(project, "Failed to restore version: ${error.message}")
            }
        }
    }
}
