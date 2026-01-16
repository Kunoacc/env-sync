package com.envsync.services

import com.envsync.api.EnvSyncApiClient
import com.envsync.crypto.EnvSyncCrypto
import com.envsync.crypto.LegacyCrypto
import com.envsync.settings.EnvSyncSettingsState
import com.envsync.util.DeviceIdResolver
import com.envsync.util.EnvFileFinder
import com.envsync.util.EnvSyncNotifications
import com.envsync.util.EnvSyncTopics
import com.envsync.util.ProjectConfig
import com.envsync.util.ProjectIdGenerator
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.nio.file.Files
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

@Service(Service.Level.PROJECT)
class EnvSyncProjectService(private val project: Project) {
    private val api = service<EnvSyncApiClient>()
    private val auth = service<EnvSyncAuthService>()
    private val settings = service<EnvSyncSettingsState>()
    private val resolvedDeviceId = DeviceIdResolver.resolve()
    private val validating = AtomicBoolean(false)

    init {
        validateExistingSession()
    }

    fun validateExistingSession() {
        val token = auth.getAccessToken() ?: return
        if (validating.getAndSet(true)) return
        ApplicationManager.getApplication().executeOnPooledThread {
            val valid = runCatching { api.validateToken(token) }.getOrDefault(false)
            if (!valid) {
                auth.clearAuth()
                project.messageBus.syncPublisher(EnvSyncTopics.AUTH_STATE).authStateChanged()
            }
            validating.set(false)
        }
    }

    fun loginWithMagicLink() {
        val email = Messages.showInputDialog(project, "Enter your email address", "EnvSync Login", null)
            ?: return
        if (!email.contains("@")) {
            EnvSyncNotifications.warn(project, "Please enter a valid email address")
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                api.sendMagicLink(email)
                val tokenHolder = arrayOfNulls<String>(1)
                ApplicationManager.getApplication().invokeAndWait {
                    tokenHolder[0] = Messages.showInputDialog(project, "Enter the 6-digit code from your email", "EnvSync Login", null)
                }
                val token = tokenHolder[0] ?: return@executeOnPooledThread
                val response = api.verifyOtp(email, token)
                auth.storeAccessToken(response.access_token)
                auth.setUserEmail(response.email)
                project.messageBus.syncPublisher(EnvSyncTopics.AUTH_STATE).authStateChanged()
                EnvSyncNotifications.info(project, "Successfully logged in")
            } catch (error: Exception) {
                EnvSyncNotifications.error(project, "Login failed: ${error.message}")
            }
        }
    }

    fun logout() {
        val token = auth.getAccessToken()
        ApplicationManager.getApplication().executeOnPooledThread {
            runCatching { if (token != null) api.logout(token) }
            auth.clearAuth()
            project.messageBus.syncPublisher(EnvSyncTopics.AUTH_STATE).authStateChanged()
            EnvSyncNotifications.info(project, "Successfully logged out")
        }
    }

    fun syncAll() {
        if (!ensureLoggedIn()) return
        val projectId = getOrSelectProject() ?: return
        val files = EnvFileFinder.findEnvFiles(project)
        if (files.isEmpty()) {
            EnvSyncNotifications.info(project, "No .env files found in the workspace")
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            for (file in files) {
                checkAndSyncFile(file, projectId)
            }
            project.messageBus.syncPublisher(EnvSyncTopics.HISTORY).historyChanged()
        }
    }

    fun pushSelected() {
        if (!ensureLoggedIn()) return
        val file = selectEnvFile() ?: return
        val projectId = getOrSelectProject() ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            pushFile(file, projectId)
            project.messageBus.syncPublisher(EnvSyncTopics.HISTORY).historyChanged()
        }
    }

    fun pullSelected() {
        if (!ensureLoggedIn()) return
        val file = selectEnvFile() ?: return
        val projectId = getOrSelectProject() ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            pullFile(file, projectId)
            project.messageBus.syncPublisher(EnvSyncTopics.HISTORY).historyChanged()
        }
    }

    fun autoSync(file: VirtualFile) {
        if (!settings.state.autoSync) return
        if (!ensureLoggedIn()) return
        val projectId = ProjectConfig.readProjectId(project) ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            checkAndSyncFile(file, projectId)
            project.messageBus.syncPublisher(EnvSyncTopics.HISTORY).historyChanged()
        }
    }

    fun getOrSelectProject(): String? {
        val saved = ProjectConfig.readProjectId(project)
        if (!saved.isNullOrBlank()) return saved
        return selectProject()
    }

    private fun selectProject(): String? {
        val token = auth.getAccessToken() ?: return null
        val projects = runCatching { api.listProjects(token) }.getOrDefault(emptyList())
        val username = auth.getUserEmail().substringBefore('@')
        val suggestedId = ProjectIdGenerator.generate(username, project)
        val createLabel = "Create new project"

        val items = mutableListOf<String>()
        items.add("$createLabel (suggested: $suggestedId)")
        items.addAll(projects.map { it.name })

        val selectedIndex = Messages.showChooseDialog("Select a project to sync with", "EnvSync: Choose Project", items.toTypedArray(), items.firstOrNull(), null)
        if (selectedIndex < 0) return null
        val selected = items[selectedIndex]

        return if (selected.startsWith(createLabel)) {
            val newName = Messages.showInputDialog(project, "Enter project name", "EnvSync: New Project", null, suggestedId, null)
                ?: return null
            val trimmed = newName.trim()
            if (!isValidProjectId(trimmed)) {
                EnvSyncNotifications.warn(project, "Project name can only contain letters, numbers, hyphens, underscores, and slashes")
                return null
            }
            ProjectConfig.writeProjectId(project, trimmed)
            EnvSyncNotifications.info(project, "Project \"$trimmed\" configured for this workspace")
            trimmed
        } else {
            ProjectConfig.writeProjectId(project, selected)
            EnvSyncNotifications.info(project, "Linked to project \"$selected\"")
            selected
        }
    }

    private fun selectEnvFile(): VirtualFile? {
        val files = EnvFileFinder.findEnvFiles(project)
        if (files.isEmpty()) {
            EnvSyncNotifications.info(project, "No .env files found in the workspace")
            return null
        }
        if (files.size == 1) return files.first()

        val labels = files.map { EnvFileFinder.relativePath(project, it) }
        val selectedIndex = Messages.showChooseDialog("Select an .env file", "EnvSync", labels.toTypedArray(), labels.firstOrNull(), null)
        if (selectedIndex < 0) return null
        return files[selectedIndex]
    }

    private fun checkAndSyncFile(file: VirtualFile, projectId: String) {
        val token = auth.getAccessToken() ?: return
        try {
            val fileContent = String(file.contentsToByteArray(), Charsets.UTF_8)
            val localHash = EnvSyncCrypto.computeHash(fileContent)
            val localTimestamp = file.timeStamp
            val remote = api.getFile(projectId, file.name, token)

            if (remote == null) {
                if (confirm("${file.name} not found in cloud. Push it?")) {
                    pushFile(file, projectId)
                }
                return
            }

            val remoteHash = remote.hash
            val remoteTimestamp = remote.updated_at?.let { Instant.parse(it).toEpochMilli() } ?: 0L

            if (remoteHash != null && remoteHash != localHash) {
                if (localTimestamp > remoteTimestamp) {
                    if (confirm("Your local ${file.name} is newer. Push to cloud?")) {
                        pushFile(file, projectId)
                    }
                } else {
                    if (confirm("Remote ${file.name} is newer. Pull from cloud?")) {
                        pullFile(file, projectId)
                    }
                }
            }
        } catch (error: Exception) {
            EnvSyncNotifications.error(project, "Error checking file ${file.name}: ${error.message}")
        }
    }

    private fun pushFile(file: VirtualFile, projectId: String) {
        val token = auth.getAccessToken() ?: return
        try {
            val fileContent = String(file.contentsToByteArray(), Charsets.UTF_8)
            val passphrase = EnvSyncCrypto.createPassphrase(auth.getUserEmail(), resolvedDeviceId)
            val encryptedContent = EnvSyncCrypto.encrypt(fileContent, passphrase)
            val hash = EnvSyncCrypto.computeHash(fileContent)
            api.putFile(projectId, file.name, encryptedContent, hash, token)
            EnvSyncNotifications.info(project, "Successfully pushed ${file.name} to cloud")
        } catch (error: Exception) {
            EnvSyncNotifications.error(project, "Error pushing file: ${error.message}")
        }
    }

    private fun pullFile(file: VirtualFile, projectId: String) {
        val token = auth.getAccessToken() ?: return
        try {
            val response = api.getFileContent(projectId, file.name, token)
            val encryptedContent = response?.content
            if (encryptedContent.isNullOrBlank()) {
                EnvSyncNotifications.info(project, "No ${file.name} found in cloud")
                return
            }

            val passphrase = EnvSyncCrypto.createPassphrase(auth.getUserEmail(), resolvedDeviceId)
            val decrypted = if (EnvSyncCrypto.isLegacyFormat(encryptedContent)) {
                val legacyKey = EnvSyncCrypto.computeHash("${auth.getUserEmail()}-$resolvedDeviceId-envsync-key")
                LegacyCrypto.decrypt(encryptedContent, legacyKey)
            } else {
                EnvSyncCrypto.decrypt(encryptedContent, passphrase)
            }

            response.hash?.let {
                val computed = EnvSyncCrypto.computeHash(decrypted)
                if (computed != it) {
                    throw IllegalStateException("Integrity check failed: content hash mismatch")
                }
            }

            writeWithBackup(file, decrypted)
            EnvSyncNotifications.info(project, "Successfully pulled ${file.name} from cloud")
        } catch (error: Exception) {
            EnvSyncNotifications.error(project, "Error pulling file: ${error.message}")
        }
    }

    private fun writeWithBackup(file: VirtualFile, content: String) {
        val ioFile = File(file.path)
        if (ioFile.exists()) {
            val backup = File("${ioFile.path}.backup-${System.currentTimeMillis()}")
            Files.copy(ioFile.toPath(), backup.toPath())
        }

        ApplicationManager.getApplication().invokeAndWait {
            ApplicationManager.getApplication().runWriteAction {
                val localFile = LocalFileSystem.getInstance().refreshAndFindFileByPath(file.path)
                localFile?.setBinaryContent(content.toByteArray(Charsets.UTF_8))
            }
        }
    }

    fun writeFileContent(fileName: String, content: String) {
        val files = EnvFileFinder.findEnvFiles(project)
        val target = files.firstOrNull { it.name == fileName }
        if (target == null) {
            EnvSyncNotifications.warn(project, "Could not find $fileName in workspace")
            return
        }
        ApplicationManager.getApplication().invokeAndWait {
            ApplicationManager.getApplication().runWriteAction {
                val localFile = LocalFileSystem.getInstance().refreshAndFindFileByPath(target.path)
                localFile?.setBinaryContent(content.toByteArray(Charsets.UTF_8))
            }
        }
    }

    fun deviceId(): String = resolvedDeviceId

    private fun ensureLoggedIn(): Boolean {
        if (!auth.isLoggedIn()) {
            EnvSyncNotifications.warn(project, "Please login first")
            return false
        }
        return true
    }

    private fun confirm(message: String): Boolean {
        val resultHolder = intArrayOf(Messages.NO)
        ApplicationManager.getApplication().invokeAndWait {
            resultHolder[0] = Messages.showYesNoDialog(project, message, "EnvSync", null)
        }
        return resultHolder[0] == Messages.YES
    }

    private fun isValidProjectId(value: String): Boolean {
        return value.length >= 2 && Regex("^[a-zA-Z0-9][a-zA-Z0-9/_-]*$").matches(value)
    }
}
