package com.envsync.util

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlin.test.assertEquals

class ProjectIdGeneratorTest : BasePlatformTestCase() {
    fun testGeneratesFromProjectName() {
        val result = ProjectIdGenerator.generate("user", project)
        val sanitized = project.name.lowercase()
            .replace(Regex("[^a-z0-9-]"), "-")
            .replace(Regex("-+"), "-")
        assertEquals("user/$sanitized", result)
    }
}
