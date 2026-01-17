package com.envsync.crypto

import com.google.gson.Gson
import com.google.gson.JsonObject
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import java.util.Base64

object EnvSyncCrypto {
    private const val ALGORITHM = "AES/GCM/NoPadding"
    private const val KEY_LENGTH = 32
    private const val IV_LENGTH = 12
    private const val SALT_LENGTH = 16
    private const val TAG_LENGTH_BITS = 128
    private const val PBKDF2_ITERATIONS = 100000
    private const val CURRENT_VERSION = 1

    private val gson = Gson()
    private val random = SecureRandom()

    data class EncryptedPayload(
        val version: Int,
        val salt: String,
        val iv: String,
        val ciphertext: String,
        val tag: String
    )

    fun createPassphrase(userEmail: String, deviceId: String): String {
        return "$userEmail:$deviceId:envsync-v$CURRENT_VERSION"
    }

    fun encrypt(content: String, passphrase: String): String {
        val salt = ByteArray(SALT_LENGTH).also { random.nextBytes(it) }
        val iv = ByteArray(IV_LENGTH).also { random.nextBytes(it) }
        val key = deriveKey(passphrase, salt)

        val cipher = Cipher.getInstance(ALGORITHM)
        val spec = GCMParameterSpec(TAG_LENGTH_BITS, iv)
        cipher.init(Cipher.ENCRYPT_MODE, key, spec)
        val cipherOutput = cipher.doFinal(content.toByteArray(Charsets.UTF_8))
        val tag = cipherOutput.copyOfRange(cipherOutput.size - 16, cipherOutput.size)
        val ciphertext = cipherOutput.copyOfRange(0, cipherOutput.size - 16)

        val payload = EncryptedPayload(
            version = CURRENT_VERSION,
            salt = salt.toHex(),
            iv = iv.toHex(),
            ciphertext = ciphertext.toHex(),
            tag = tag.toHex()
        )

        val json = gson.toJson(payload)
        return Base64.getEncoder().encodeToString(json.toByteArray(Charsets.UTF_8))
    }

    fun decrypt(encryptedData: String, passphrase: String): String {
        val payload = parsePayload(encryptedData)
        if (payload.version != CURRENT_VERSION) {
            throw IllegalArgumentException("Unsupported encryption version: ${payload.version}")
        }

        val salt = payload.salt.hexToBytes()
        val iv = payload.iv.hexToBytes()
        val ciphertext = payload.ciphertext.hexToBytes()
        val tag = payload.tag.hexToBytes()
        val key = deriveKey(passphrase, salt)

        val cipher = Cipher.getInstance(ALGORITHM)
        val spec = GCMParameterSpec(TAG_LENGTH_BITS, iv)
        cipher.init(Cipher.DECRYPT_MODE, key, spec)
        val combined = ByteArray(ciphertext.size + tag.size)
        System.arraycopy(ciphertext, 0, combined, 0, ciphertext.size)
        System.arraycopy(tag, 0, combined, ciphertext.size, tag.size)
        val decrypted = cipher.doFinal(combined)
        return String(decrypted, Charsets.UTF_8)
    }

    fun computeHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(content.toByteArray(Charsets.UTF_8))
        return hash.toHex()
    }

    fun isModernFormat(encryptedData: String): Boolean {
        return try {
            val decoded = Base64.getDecoder().decode(encryptedData)
            val json = gson.fromJson(String(decoded, Charsets.UTF_8), JsonObject::class.java)
            json.has("version") && json.has("salt") && json.has("iv") && json.has("ciphertext") && json.has("tag")
        } catch (_: Exception) {
            false
        }
    }

    fun isLegacyFormat(encryptedData: String): Boolean = !isModernFormat(encryptedData)

    private fun deriveKey(passphrase: String, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(passphrase.toCharArray(), salt, PBKDF2_ITERATIONS, KEY_LENGTH * 8)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val key = factory.generateSecret(spec).encoded
        return SecretKeySpec(key, "AES")
    }

    private fun parsePayload(encryptedData: String): EncryptedPayload {
        val decoded = Base64.getDecoder().decode(encryptedData)
        return gson.fromJson(String(decoded, Charsets.UTF_8), EncryptedPayload::class.java)
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun String.hexToBytes(): ByteArray {
        val buffer = ByteBuffer.allocate(length / 2)
        for (i in indices step 2) {
            buffer.put(substring(i, i + 2).toInt(16).toByte())
        }
        return buffer.array()
    }
}
