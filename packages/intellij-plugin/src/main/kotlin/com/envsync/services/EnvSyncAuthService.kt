package com.envsync.services

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.Service
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.util.text.StringUtil

@Service
class EnvSyncAuthService {
    private val passwordSafe = PasswordSafe.instance
    private val properties = PropertiesComponent.getInstance()

    private val credentialsAttributes = CredentialAttributes(generateServiceName("EnvSync", "accessToken"))

    fun getAccessToken(): String? {
        return passwordSafe.get(credentialsAttributes)?.getPasswordAsString()
    }

    fun storeAccessToken(token: String) {
        passwordSafe.set(credentialsAttributes, Credentials("envsync", token))
    }

    fun clearAccessToken() {
        passwordSafe.set(credentialsAttributes, null)
    }

    fun getUserEmail(): String {
        return properties.getValue("envsync.userEmail", "")
    }

    fun setUserEmail(email: String) {
        properties.setValue("envsync.userEmail", email)
    }

    fun clearUserEmail() {
        properties.unsetValue("envsync.userEmail")
    }

    fun isLoggedIn(): Boolean {
        return !StringUtil.isEmptyOrSpaces(getAccessToken())
    }

    fun clearAuth() {
        clearAccessToken()
        clearUserEmail()
    }
}
