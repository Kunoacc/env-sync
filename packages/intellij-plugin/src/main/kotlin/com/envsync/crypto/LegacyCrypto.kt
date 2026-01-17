package com.envsync.crypto

import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

object LegacyCrypto {
    private const val SALTED_PREFIX = "Salted__"

    fun decrypt(cipherTextBase64: String, passphrase: String): String {
        val encrypted = Base64.getDecoder().decode(cipherTextBase64)
        if (encrypted.size < 16) {
            throw IllegalArgumentException("Invalid legacy payload")
        }

        val (salt, ciphertext) = if (String(encrypted, 0, 8, Charsets.UTF_8) == SALTED_PREFIX) {
            val saltBytes = encrypted.copyOfRange(8, 16)
            val cipherBytes = encrypted.copyOfRange(16, encrypted.size)
            saltBytes to cipherBytes
        } else {
            null to encrypted
        }

        val keyAndIv = evpBytesToKey(passphrase.toByteArray(Charsets.UTF_8), salt)
        val key = keyAndIv.first
        val iv = keyAndIv.second

        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
        val decrypted = cipher.doFinal(ciphertext)
        return String(decrypted, Charsets.UTF_8)
    }

    private fun evpBytesToKey(passphrase: ByteArray, salt: ByteArray?): Pair<ByteArray, ByteArray> {
        val keySize = 32
        val ivSize = 16
        var derived = ByteArray(0)
        var block: ByteArray? = null

        while (derived.size < keySize + ivSize) {
            val md5 = MessageDigest.getInstance("MD5")
            if (block != null) {
                md5.update(block)
            }
            md5.update(passphrase)
            if (salt != null) {
                md5.update(salt)
            }
            block = md5.digest()
            derived += block
        }

        val key = derived.copyOfRange(0, keySize)
        val iv = derived.copyOfRange(keySize, keySize + ivSize)
        return key to iv
    }
}
