package com.envsync.services

import com.envsync.settings.EnvSyncSettingsState
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.Disposable
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

@Service(Service.Level.PROJECT)
class EnvSyncAutoSyncService(private val project: Project) : Disposable {
    private val projectService = service<EnvSyncProjectService>()
    private val settings = service<EnvSyncSettingsState>()
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private val debounce = ConcurrentHashMap<String, ScheduledFuture<*>>()

    init {
        val connection = project.messageBus.connect(this)
        connection.subscribe(VirtualFileManager.VFS_CHANGES, object : BulkFileListener {
            override fun after(events: List<VFileEvent>) {
                if (!settings.state.autoSync) return
                val fileIndex = ProjectFileIndex.getInstance(project)
                for (event in events) {
                    val file = when (event) {
                        is VFileContentChangeEvent -> event.file
                        is VFileCreateEvent -> event.file
                        else -> null
                    } ?: continue

                    if (!fileIndex.isInContent(file)) continue
                    if (file.name.contains(".backup-")) continue
                    if (!matchesPattern(file.name, settings.state.filePatterns)) continue

                    schedule(file.path) { projectService.autoSync(file) }
                }
            }
        })
    }

    private fun schedule(key: String, task: () -> Unit) {
        debounce[key]?.cancel(false)
        debounce[key] = scheduler.schedule({
            debounce.remove(key)
            task()
        }, 1, TimeUnit.SECONDS)
    }

    private fun matchesPattern(fileName: String, patterns: List<String>): Boolean {
        return patterns.any { pattern ->
            if (pattern.contains("*")) {
                val regex = globToRegex(pattern)
                regex.matches(fileName)
            } else {
                pattern == fileName
            }
        }
    }

    private fun globToRegex(pattern: String): Regex {
        val escaped = Regex.escape(pattern)
        val regex = escaped.replace("\\*", ".*")
        return Regex("^$regex$")
    }

    override fun dispose() {
        scheduler.shutdownNow()
    }
}
