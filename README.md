# EnvSync - Secure Environment Variable Synchronization

![EnvSync Logo](https://via.placeholder.com/200x200?text=EnvSync)

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/blvckcoder.env-sync)](https://marketplace.visualstudio.com/items?itemName=blvckcoder.env-sync)
[![VS Code Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/blvckcoder.env-sync)](https://marketplace.visualstudio.com/items?itemName=blvckcoder.env-sync)
[![GitHub Workflow Status](https://img.shields.io/github/workflow/status/kunoacc/env-sync/Extension%20CI)](https://github.com/kunoacc/env-sync/actions)

## Overview

EnvSync is a VS Code extension that securely synchronizes environment variables across your projects. Tired of managing multiple `.env` files and sharing them with your team in insecure ways? EnvSync solves this problem by providing a secure, encrypted way to sync environment variables across your development setup.

## Features

- 🔑 **Secure Authentication**: Login with GitHub (via Supabase Auth)
- 🔒 **End-to-End Encryption**: Environment variables are encrypted before leaving your machine
- 🔄 **Automatic Synchronization**: Optional auto-sync when .env files change
- 📈 **Version History**: Keep track of changes to your environment variables
- 🌐 **Multiple Environment Support**: Support for different environment types (.env, .env.local, .env.development)
- 👥 **Team Sharing**: Securely share environment variables with your team

## Project Structure

This project consists of two main components:

1. **VS Code Extension**: The main extension that integrates with VS Code
2. **Supabase Functions**: Serverless functions for authentication and other backend operations

```
env-sync/
├── dist/               # Compiled extension code
├── functions/          # Supabase Deno functions
│   └── auth-login/     # Authentication login function
├── src/                # Extension source code
├── .github/workflows/  # CI/CD pipelines
└── ... (other files)
```

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "EnvSync"
4. Click Install

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/kunoacc/env-sync.git

# Install dependencies
cd env-sync
npm install

# Build the extension
npm run build
```

## Usage

1. **Login**: Command Palette > "EnvSync: Login" (This will open your browser for authentication)
2. **Sync Environment**: Command Palette > "EnvSync: Sync .env Files"
3. **Push Changes**: Command Palette > "EnvSync: Push Current .env"
4. **Pull Latest**: Command Palette > "EnvSync: Pull Latest .env"

## Configuration

EnvSync can be configured through VS Code settings:

```json
{
  "envsync.autoSync": true, // Automatically sync when .env files change
  "envsync.filePatterns": [".env", ".env.local", ".env.development"] // Files to track
}
```

## Security

- All environment variables are encrypted on your machine before being sent to the server
- Encryption keys are derived from your machine ID and never leave your device
- We use industry-standard encryption algorithms (AES-256-GCM)
- Authentication is handled by Supabase with OAuth providers

## Development

### Prerequisites

- Node.js >= 16
- npm or yarn
- VS Code
- Deno (for Supabase Functions development)

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/kunoacc/env-sync.git

# Install dependencies
cd env-sync
npm install

# Watch for changes and rebuild
npm run watch
```

### Running the Extension

- Press F5 in VS Code to launch a new window with the extension loaded
- Find and run your extension commands from the Command Palette

### Supabase Functions Development

```bash
# Navigate to functions directory
cd functions

# Run auth-login function locally
deno run --allow-net --allow-env --allow-read ./auth-login/index.ts
```

## Deployment

This project uses GitHub Actions for automated deployments:

- VS Code Extension is published to the Marketplace automatically on tags
- Supabase Functions are deployed to your Supabase project

## Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Supabase](https://supabase.io/) for authentication and storage
- [VS Code Extension API](https://code.visualstudio.com/api) for the extension framework
