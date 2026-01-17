package com.envsync.ui

import com.envsync.services.EnvSyncAuthService
import com.envsync.util.EnvSyncTopics
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer

class EnvSyncStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "EnvSyncStatus"

    override fun getDisplayName(): String = "EnvSync"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget {
        return EnvSyncStatusBarWidget(project)
    }

    override fun disposeWidget(widget: StatusBarWidget) {
        widget.dispose()
    }
}

private class EnvSyncStatusBarWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {
    private val auth = service<EnvSyncAuthService>()
    private var statusBar: StatusBar? = null

    override fun ID(): String = "EnvSyncStatusWidget"

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect(this).subscribe(EnvSyncTopics.AUTH_STATE, object : com.envsync.util.AuthStateListener {
            override fun authStateChanged() {
                statusBar.updateWidget(ID())
            }
        })
    }

    override fun dispose() {}

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun getText(): String {
        return if (auth.isLoggedIn()) {
            val email = auth.getUserEmail()
            if (email.isBlank()) "EnvSync" else "EnvSync: ${email.substringBefore('@')}"
        } else {
            "EnvSync"
        }
    }

    override fun getTooltipText(): String = if (auth.isLoggedIn()) "Logged in" else "Not logged in"

    override fun getAlignment(): Float = 0f

    override fun getClickConsumer(): Consumer<java.awt.event.MouseEvent>? = null
}
