# EnvSync

Sync your `.env` files across projects via secure cloud storage. Available for **VS Code** and **JetBrains IDEs**.

## Features

- **Secure Storage** - Environment files are encrypted client-side (AES-256-GCM) before uploading
- **Project Isolation** - Each project uses its own cloud storage
- **Version History** - Track changes and restore previous versions
- **Auto-Sync** - Automatically push changes when files are modified (optional)
- **Multi-File Support** - Sync multiple `.env` files (`.env`, `.env.local`, `.env.development`, etc.)
- **Cross-Device Access** - Access your env files from any machine
- **Cross-IDE Compatibility** - Files encrypted in VS Code can be decrypted in IntelliJ (same machine)

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`packages/vscode-extension`](./packages/vscode-extension) | VS Code extension | Stable |
| [`packages/intellij-plugin`](./packages/intellij-plugin) | IntelliJ/JetBrains plugin | Beta |

## Quick Start

### VS Code

```bash
cd packages/vscode-extension
bun install
bun run build
bun run package
code --install-extension env-sync-*.vsix
```

### IntelliJ / JetBrains IDEs

```bash
cd packages/intellij-plugin
./gradlew buildPlugin
# Plugin zip will be in build/distributions/
# Install via Settings > Plugins > Install from disk
```

## Backend (Supabase)

The backend lives in `supabase/` and consists of:
- `supabase/functions/auth/` - Authentication (magic link, OAuth)
- `supabase/functions/files/` - File storage and versioning

### Deploy

```bash
cd supabase
supabase link --project-ref your-project-ref
supabase db push --linked
supabase functions deploy auth --no-verify-jwt
supabase functions deploy files --no-verify-jwt
```

## Security

All `.env` content is encrypted **before** it leaves your machine:

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 (100,000 iterations, SHA-256)
- **Key Source**: Your email + machine ID (unique per device)

The server never sees your unencrypted environment variables.

## Repository Structure

```
env-sync/
├── packages/
│   ├── vscode-extension/   # VS Code extension (TypeScript)
│   └── intellij-plugin/    # JetBrains plugin (Kotlin)
├── supabase/
│   └── functions/          # Backend edge functions
└── README.md               # This file
```

## License

MIT
