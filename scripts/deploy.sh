#!/bin/bash
set -e

echo "=== EnvSync Manual Deploy ==="
echo ""

if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is required but not installed."
    echo "Install: brew install supabase/tap/supabase"
    exit 1
fi

if [ -z "$1" ]; then
    echo "Usage: ./scripts/deploy.sh <project-ref>"
    echo ""
    echo "Get your project ref from:"
    echo "  https://supabase.com/dashboard/project/_/settings/general"
    echo ""
    echo "Example: ./scripts/deploy.sh abcdefghijklmnop"
    exit 1
fi

PROJECT_REF=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Project: $PROJECT_REF"
echo ""

if ! supabase projects list &> /dev/null 2>&1; then
    echo "Not logged in to Supabase. Running 'supabase login'..."
    supabase login
fi

cd "$PROJECT_DIR/supabase"

echo "Linking project..."
supabase link --project-ref $PROJECT_REF

echo ""
echo "Deploying database migrations..."
supabase db push

echo ""
echo "Deploying Edge Functions..."
supabase functions deploy auth --no-verify-jwt
supabase functions deploy files --no-verify-jwt

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "Your API URL is:"
echo "  https://$PROJECT_REF.supabase.co/functions/v1"
echo ""
echo "Add this to your VS Code settings:"
echo '  "envsync.apiUrl": "https://'$PROJECT_REF'.supabase.co/functions/v1"'
echo ""
echo "Or set it in Settings > Extensions > EnvSync > Api Url"
