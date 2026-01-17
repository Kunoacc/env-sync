package com.envsync.util

import com.intellij.openapi.diagnostic.Logger
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.Locale

object DeviceIdResolver {
    private val log = Logger.getInstance(DeviceIdResolver::class.java)

    fun resolve(): String {
        return try {
            when (os()) {
                "mac" -> resolveMac()
                "windows" -> resolveWindows()
                else -> resolveLinux()
            }
        } catch (error: Exception) {
            log.warn("Failed to resolve device id", error)
            "unknown-device"
        }
    }

    private fun os(): String {
        val name = System.getProperty("os.name").lowercase(Locale.getDefault())
        return when {
            name.contains("mac") -> "mac"
            name.contains("win") -> "windows"
            else -> "linux"
        }
    }

    private fun resolveMac(): String {
        val output = runCommand("ioreg", "-rd1", "-c", "IOPlatformExpertDevice")
        val regex = Regex("\"IOPlatformUUID\" = \"([^\"]+)\"")
        return regex.find(output)?.groupValues?.get(1)
            ?: throw IllegalStateException("IOPlatformUUID not found")
    }

    private fun resolveWindows(): String {
        val output = runCommand("reg", "query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid")
        val regex = Regex("MachineGuid\\s+REG_SZ\\s+([\\w-]+)")
        return regex.find(output)?.groupValues?.get(1)
            ?: throw IllegalStateException("MachineGuid not found")
    }

    private fun resolveLinux(): String {
        val machineId = readFile("/etc/machine-id") ?: readFile("/var/lib/dbus/machine-id")
        return machineId?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw IllegalStateException("machine-id not found")
    }

    private fun readFile(path: String): String? {
        val file = File(path)
        return if (file.exists()) file.readText() else null
    }

    private fun runCommand(vararg command: String): String {
        val process = ProcessBuilder(*command).redirectErrorStream(true).start()
        val reader = BufferedReader(InputStreamReader(process.inputStream))
        val output = reader.readText()
        process.waitFor()
        return output
    }
}
