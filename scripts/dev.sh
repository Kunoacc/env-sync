#!/bin/bash
set -e

echo "=== EnvSync Local Development Setup ==="
echo ""

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "Error: $1 is required but not installed."
        exit 1
    fi
}

check_command "supabase"
check_command "npm"
check_command "docker"

if ! docker info &> /dev/null; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

echo "Starting Supabase local stack..."
cd supabase
supabase start

echo ""
echo "=== Supabase Local URLs ==="
supabase status

echo ""
echo "Starting Edge Functions in watch mode..."
supabase functions serve --env-file ../supabase/.env.local &
FUNCTIONS_PID=$!

cd ..

echo ""
echo "=== VS Code Extension Development ==="
echo "1. Open VS Code in this directory"
echo "2. Press F5 to launch Extension Development Host"
echo "3. Configure envsync.apiUrl in settings:"
echo "   http://127.0.0.1:54321/functions/v1"
echo ""
echo "=== Local Supabase Credentials ==="
echo "API URL: http://127.0.0.1:54321"
echo "Functions URL: http://127.0.0.1:54321/functions/v1"
echo ""
echo "Press Ctrl+C to stop all services"

cleanup() {
    echo ""
    echo "Stopping services..."
    kill $FUNCTIONS_PID 2>/dev/null || true
    cd supabase && supabase stop
    echo "Done."
}

trap cleanup EXIT

wait $FUNCTIONS_PID
