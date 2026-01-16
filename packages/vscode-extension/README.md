# EnvSync - VS Code Extension

Sync your `.env` files across projects via secure cloud storage.

## Features

- **Secure Storage** - Environment files are encrypted client-side before uploading
- **Project Isolation** - Each project uses its own cloud storage
- **Version History** - Track changes and restore previous versions
- **Auto-Sync** - Automatically push changes when files are modified (optional)
- **Multi-File Support** - Sync multiple `.env` files (`.env`, `.env.local`, `.env.development`, etc.)
- **Cross-Device Access** - Access your env files from any machine

## Installation

### From VSIX

```bash
code --install-extension env-sync-0.0.1.vsix
```

### From VS Marketplace (Coming Soon)

Search "EnvSync" in the Extensions Marketplace.

## Quick Start

### 1. Login

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run `EnvSync: Login`
3. Choose **Email (Magic Link)**
4. Enter your email address
5. Check your inbox for a 6-digit code
6. Enter the code to complete login

### 2. Push Your First .env

1. Open a project with a `.env` file
2. Run `EnvSync: Push to Cloud`
3. Select or create a project name (e.g., `yourname/my-app`)
4. Done! Your `.env` is now synced.

### 3. Pull on Another Machine

1. Login with the same email
2. Run `EnvSync: Pull from Cloud`
3. Select your project
4. Your `.env` file is restored

## Usage

### Push to Cloud

```
EnvSync: Push to Cloud
```

Uploads your `.env` file to the cloud. Shows a quick-pick if you have multiple `.env` files.

### Pull from Cloud

```
EnvSync: Pull from Cloud
```

Downloads the latest version from the cloud. Creates a backup file before overwriting.

### Smart Sync

```
EnvSync: Sync
```

Compares local and remote versions:
- If local is newer → prompts to push
- If remote is newer → prompts to pull
- If new file → prompts to push

### View History

Open the **EnvSync History** sidebar to:
- See all synced `.env` files
- Browse version history for each file
- Restore previous versions with one click

### Auto-Sync (Optional)

Enable automatic syncing when files change:

1. Open Settings
2. Search for `EnvSync: Auto Sync`
3. Set to `true`

## Project Management

### Project IDs

Projects are identified by user-scoped IDs:
- Format: `username/project-name`
- Example: `nelson/my-web-app`

This prevents collisions between users with similarly-named projects.

### Local Config

Your project choice is saved to `.envsync.json` in your project root:

```json
{
  "projectId": "nelson/my-app"
}
```

This file is automatically gitignored.

### Switching Projects

To change which cloud project a local folder syncs to:

1. Delete `.envsync.json` from your project root
2. Run `EnvSync: Push to Cloud`
3. Select a different project

## Security

### Client-Side Encryption

All `.env` content is encrypted **before** it leaves your machine:

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 (100,000 iterations)
- **Key Source**: Your email + machine ID (unique per device)

The server never sees your unencrypted environment variables.

### Access Tokens

Stored in VS Code's secure storage (`context.secrets`):
- Never exposed in logs
- Survives VS Code restarts
- Cleared on logout

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `envsync.apiUrl` | Production URL | API endpoint (only change for self-hosting) |
| `envsync.filePatterns` | `.env`, `.env.local`, `.env.development`, `.envrc`, `application.properties`, `application.yml`, `application.yaml`, `application-*.properties`, `application-*.yml`, `application-*.yaml`, `appsettings.json`, `appsettings.*.json`, `config/*.exs` | Files to sync |
| `envsync.autoSync` | `false` | Auto-sync on file changes |

## Troubleshooting

### "Please login first"

Your session may have expired. Run `EnvSync: Login` again.

### "Project not found in cloud"

This is a new project. Push it first with `EnvSync: Push to Cloud`.

### Version history shows "No version history available"

The file hasn't been pushed to cloud yet, or this is the first version.

### Auto-sync not working

1. Ensure `envsync.autoSync` is set to `true`
2. Check that file patterns match your `.env` files
3. Verify you're logged in

## Self-Hosting

To use your own Supabase instance:

1. Deploy the Supabase functions from `supabase/` folder
2. Update `envsync.apiUrl` in VS Code settings

```json
{
  "envsync.apiUrl": "https://your-project.supabase.co/functions/v1"
}
```

## Development

### Build

```bash
bun install
bun run compile  # Type-check
bun run build    # Bundle with webpack
bun run package  # Create .vsix
```

### Deploy Backend

```bash
cd supabase
supabase link --project-ref your-project-ref
supabase db push --linked
supabase functions deploy auth --no-verify-jwt
supabase functions deploy files --no-verify-jwt
```

## License

MIT
