package com.envsync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EnvSyncCryptoTest {
    @Test
    fun roundTripEncryption() {
        val passphrase = EnvSyncCrypto.createPassphrase("user@example.com", "device-123")
        val content = "HELLO=world\nANOTHER=value"
        val encrypted = EnvSyncCrypto.encrypt(content, passphrase)

        assertTrue(EnvSyncCrypto.isModernFormat(encrypted))
        assertFalse(EnvSyncCrypto.isLegacyFormat(encrypted))

        val decrypted = EnvSyncCrypto.decrypt(encrypted, passphrase)
        assertEquals(content, decrypted)
    }

    @Test
    fun computeHashDeterministic() {
        val content = "HELLO=world"
        assertEquals(EnvSyncCrypto.computeHash(content), EnvSyncCrypto.computeHash(content))
    }
}
