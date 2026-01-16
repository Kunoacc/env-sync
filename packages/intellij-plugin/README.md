# EnvSync - IntelliJ Plugin

Sync your `.env` files across projects via secure cloud storage. Works with all JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.).

> This package lives in `packages/intellij-plugin` in the EnvSync monorepo.

## Features

- **Secure Storage** - Environment files are encrypted client-side (AES-256-GCM) before uploading
- **Project Isolation** - Each project uses its own cloud storage
- **Version History** - Track changes and restore previous versions with the History tool window
- **Auto-Sync** - Automatically push changes when files are modified (optional)
- **Multi-File Support** - Sync multiple `.env` files (`.env`, `.env.local`, `.env.development`, etc.)
- **Cross-Device Access** - Access your env files from any machine
- **VS Code Compatibility** - Files encrypted in VS Code can be decrypted here (same machine)

## Installation

### From Plugin Zip

1. Build the plugin: `./gradlew buildPlugin`
2. In your JetBrains IDE: **Settings** > **Plugins** > **⚙️** > **Install Plugin from Disk...**
3. Select `build/distributions/envsync-intellij-*.zip`

### From JetBrains Marketplace (Coming Soon)

Search "EnvSync" in the Plugin Marketplace.

## Quick Start

### 1. Login

1. Open **Tools** > **EnvSync** > **EnvSync: Login**
2. Enter your email address
3. Check your inbox for a 6-digit code
4. Enter the code to complete login

### 2. Push Your First .env

1. Open a project with a `.env` file
2. Run **Tools** > **EnvSync** > **EnvSync: Push to Cloud**
3. Select or create a project name (e.g., `yourname/my-app`)
4. Done! Your `.env` is now synced.

### 3. Pull on Another Machine

1. Login with the same email
2. Run **Tools** > **EnvSync** > **EnvSync: Pull from Cloud**
3. Select your project
4. Your `.env` file is restored

## Usage

### Actions (Tools > EnvSync)

| Action | Description |
|--------|-------------|
| **Login** | Authenticate with magic link |
| **Logout** | Clear your session |
| **Sync** | Smart sync - compares local/remote and prompts |
| **Push to Cloud** | Upload your `.env` to the cloud |
| **Pull from Cloud** | Download the latest version |
| **Refresh History** | Reload the history panel |

### History Tool Window

Open the **EnvSync History** tool window (right sidebar) to:
- See all synced `.env` files
- Browse version history for each file
- Restore previous versions with double-click or Restore button

### Auto-Sync (Optional)

Enable automatic syncing when files change:

1. Open **Settings** > **EnvSync**
2. Check **Enable auto-sync**

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| API URL | Production URL | API endpoint (only change for self-hosting) |
| File patterns | `.env`, `.env.local`, `.env.development`, `.envrc`, `application.properties`, `application.yml`, `application.yaml`, `application-*.properties`, `application-*.yml`, `application-*.yaml`, `appsettings.json`, `appsettings.*.json`, `config/*.exs` | Files to sync |
| Auto-sync | `false` | Auto-sync on file changes |

## Project Management

### Project IDs

Projects are identified by user-scoped IDs:
- Format: `username/project-name`
- Example: `nelson/my-web-app`

### Local Config

Your project choice is saved to `.envsync.json` in your project root:

```json
{
  "projectId": "nelson/my-app"
}
```

This is the same format used by the VS Code extension, so switching IDEs is seamless.

## Security

All `.env` content is encrypted **before** it leaves your machine:

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 (100,000 iterations, SHA-256)
- **Key Source**: Your email + machine ID (unique per device)

Access tokens are stored in the IDE's secure credential store (PasswordSafe).

## Development

### Build

```bash
./gradlew buildPlugin
```

The plugin zip will be in `build/distributions/`.

### Run in Development IDE

```bash
./gradlew runIde
```

This launches a sandboxed IDE instance with the plugin installed.

### Requirements

- JDK 17+
- Gradle 8+

## Compatibility

- **IDE versions**: 2023.3 - 2024.3
- **Platforms**: macOS, Windows, Linux
- **IDEs**: IntelliJ IDEA, WebStorm, PyCharm, GoLand, PhpStorm, RubyMine, CLion, Rider, DataGrip, Android Studio

## License

MIT
