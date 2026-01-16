package com.envsync.util

import com.envsync.settings.EnvSyncSettingsState
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.psi.search.FilenameIndex
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VfsUtilCore

object EnvFileFinder {
    fun findEnvFiles(project: Project): List<VirtualFile> {
        val settings = service<EnvSyncSettingsState>().state
        val patterns = settings.filePatterns
        val scope = GlobalSearchScope.projectScope(project)
        val fileIndex = ProjectFileIndex.getInstance(project)

        val results = mutableSetOf<VirtualFile>()
        for (pattern in patterns) {
            if (pattern.contains("*")) {
                val nameRegex = globToRegex(pattern)
                val matches = FilenameIndex.getAllFilesByExt(project, "", scope)
                for (file in matches) {
                    if (nameRegex.matches(file.name) && fileIndex.isInContent(file)) {
                        results.add(file)
                    }
                }
            } else {
                val files = FilenameIndex.getVirtualFilesByName(project, pattern, scope)
                for (file in files) {
                    if (fileIndex.isInContent(file)) {
                        results.add(file)
                    }
                }
            }
        }
        return results.sortedBy { it.path }
    }

    private fun globToRegex(pattern: String): Regex {
        val escaped = Regex.escape(pattern)
        val regex = escaped.replace("\\*", ".*")
        return Regex("^$regex$")
    }

    fun relativePath(project: Project, file: VirtualFile): String {
        val contentRoots = ProjectRootManager.getInstance(project).contentRoots
        for (root in contentRoots) {
            val relative = VfsUtilCore.getRelativePath(file, root)
            if (relative != null) {
                return "${root.name}: $relative"
            }
        }
        return file.path
    }
}
