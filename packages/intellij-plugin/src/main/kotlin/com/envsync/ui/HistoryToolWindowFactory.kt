package com.envsync.ui

import com.envsync.services.EnvSyncHistoryService
import com.envsync.util.EnvFileFinder
import com.envsync.util.EnvSyncTopics
import com.envsync.util.ProjectConfig
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBPanel
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.treeStructure.SimpleTree
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.swing.JButton
import javax.swing.JToolBar
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class HistoryToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = HistoryPanel(project)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

private class HistoryPanel(private val project: Project) : JBPanel<HistoryPanel>(BorderLayout()), Disposable {
    private val historyService = project.service<EnvSyncHistoryService>()
    private val tree = SimpleTree()
    private val model = DefaultTreeModel(DefaultMutableTreeNode("EnvSync"))
    private val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a")
        .withZone(ZoneId.systemDefault())

    init {
        border = JBUI.Borders.empty()
        tree.model = model
        tree.isRootVisible = false
        tree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) {
                    handleRestore()
                }
            }
        })

        val toolbar = JToolBar()
        toolbar.isFloatable = false
        val refresh = JButton("Refresh")
        refresh.addActionListener { refresh() }
        val restore = JButton("Restore")
        restore.addActionListener { handleRestore() }
        toolbar.add(refresh)
        toolbar.add(restore)

        add(toolbar, BorderLayout.NORTH)
        add(ScrollPaneFactory.createScrollPane(tree), BorderLayout.CENTER)

        Disposer.register(this, project.messageBus.connect().also {
            it.subscribe(EnvSyncTopics.HISTORY, object : com.envsync.util.HistoryListener {
                override fun historyChanged() {
                    refresh()
                }
            })
        })

        refresh()
    }

    override fun dispose() {}

    private fun refresh() {
        val token = project.service<com.envsync.services.EnvSyncAuthService>().getAccessToken()
        if (token.isNullOrBlank()) {
            setEmptyMessage("Please log in to view sync history")
            return
        }

        val projectId = ProjectConfig.readProjectId(project)
        if (projectId.isNullOrBlank()) {
            setEmptyMessage("Run EnvSync: Push to configure project")
            return
        }

        val files = EnvFileFinder.findEnvFiles(project)
        if (files.isEmpty()) {
            setEmptyMessage("No .env files found in workspace")
            return
        }

        historyService.refresh { entries ->
            com.intellij.openapi.application.ApplicationManager.getApplication().invokeLater {
                val root = DefaultMutableTreeNode("EnvSync")
                for (entry in entries) {
                    val label = if (entry.lastSynced != null) {
                        "${entry.fileName} (Last synced: ${formatter.format(entry.lastSynced)})"
                    } else {
                        "${entry.fileName} (Never synced)"
                    }
                    val fileNode = DefaultMutableTreeNode(HistoryNode.File(entry.fileName, label))

                    if (entry.versions.isEmpty()) {
                        fileNode.add(DefaultMutableTreeNode("No version history available"))
                    } else {
                        for (version in entry.versions) {
                            val versionLabel = if (version.isCurrent) {
                                "Current Version"
                            } else {
                                "Version from ${version.timestamp?.let { formatter.format(it) } ?: "Unknown"}"
                            }
                            val node = DefaultMutableTreeNode(HistoryNode.Version(projectId, entry.fileName, version.id, version.isCurrent, versionLabel))
                            fileNode.add(node)
                        }
                    }
                    root.add(fileNode)
                }
                model.setRoot(root)
                tree.expandRow(0)
            }
        }
    }

    private fun handleRestore() {
        val selected = tree.lastSelectedPathComponent as? DefaultMutableTreeNode ?: return
        val node = selected.userObject
        if (node is HistoryNode.Version && !node.isCurrent) {
            val confirm = com.intellij.openapi.ui.Messages.showYesNoDialog(
                project,
                "Restore this version of ${node.fileName}?",
                "EnvSync",
                null
            )
            if (confirm != com.intellij.openapi.ui.Messages.YES) return
            historyService.restoreVersion(node.projectId, node.fileName, node.versionId)
        }
    }

    private fun setEmptyMessage(message: String) {
        val root = DefaultMutableTreeNode("EnvSync")
        root.add(DefaultMutableTreeNode(message))
        model.setRoot(root)
    }

    private sealed class HistoryNode(private val label: String) {
        data class File(val fileName: String, val display: String) : HistoryNode(display)
        data class Version(
            val projectId: String,
            val fileName: String,
            val versionId: String,
            val isCurrent: Boolean,
            val display: String
        ) : HistoryNode(display)

        override fun toString(): String = label
    }
}
