#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE_DIR="$ROOT_DIR/packages/vscode-extension"
INTELLIJ_DIR="$ROOT_DIR/packages/intellij-plugin"

NEW_VERSION="${1:-}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command bun
require_command perl

if [ ! -x "$INTELLIJ_DIR/gradlew" ]; then
  echo "Missing executable Gradle wrapper at $INTELLIJ_DIR/gradlew" >&2
  exit 1
fi

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: scripts/prerelease.sh <version>" >&2
  exit 1
fi

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Version must be semver (e.g. 0.1.0)." >&2
  exit 1
fi

CURRENT_VERSION=$(node -e "console.log(require('${VSCODE_DIR}/package.json').version)")

if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "New version matches current version: $NEW_VERSION" >&2
  exit 1
fi

echo "Updating VS Code extension version: $CURRENT_VERSION -> $NEW_VERSION"
node -e "const fs=require('fs');const p='${VSCODE_DIR}/package.json';const pkg=JSON.parse(fs.readFileSync(p,'utf8'));pkg.version='${NEW_VERSION}';fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n');"

INTELLIJ_BUILD_FILE="$INTELLIJ_DIR/build.gradle.kts"
INTELLIJ_XML_FILE="$INTELLIJ_DIR/src/main/resources/META-INF/plugin.xml"

if ! grep -q "version = \"" "$INTELLIJ_BUILD_FILE"; then
  echo "Could not find IntelliJ version in build.gradle.kts" >&2
  exit 1
fi

echo "Updating IntelliJ plugin version to $NEW_VERSION"
perl -0pi -e "s/version = \"[0-9]+\.[0-9]+\.[0-9]+\"/version = \"${NEW_VERSION}\"/" "$INTELLIJ_BUILD_FILE"

if grep -q "<version>" "$INTELLIJ_XML_FILE"; then
  perl -0pi -e "s/<version>[^<]+<\/version>/<version>${NEW_VERSION}<\/version>/" "$INTELLIJ_XML_FILE"
else
  perl -0pi -e "s/<name>EnvSync<\/name>/<name>EnvSync<\/name>\n    <version>${NEW_VERSION}<\/version>/" "$INTELLIJ_XML_FILE"
fi

if grep -q "<change-notes><!\[CDATA\[" "$INTELLIJ_XML_FILE"; then
  perl -0pi -e "s/<change-notes><!\[CDATA\[/<change-notes><!\[CDATA\[\n        <h3>${NEW_VERSION}<\/h3>\n        <ul>\n            <li>Release ${NEW_VERSION}<\/li>\n        <\/ul>/" "$INTELLIJ_XML_FILE"
fi

pushd "$VSCODE_DIR" >/dev/null
bun install
bun run tsc --noEmit
bun run build
bun run package
popd >/dev/null

pushd "$INTELLIJ_DIR" >/dev/null
./gradlew clean buildPlugin
popd >/dev/null

echo "Pre-release checks complete. Artifacts generated:" 
ls -1 "$VSCODE_DIR"/*.vsix "$INTELLIJ_DIR"/build/distributions/*.zip
