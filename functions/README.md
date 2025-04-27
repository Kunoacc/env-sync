# EnvSync Supabase Functions

This directory contains Supabase Edge Functions for the EnvSync application. Supabase Functions run on Deno, which uses URL imports rather than npm-style imports.

## Available Functions

- `auth-login`: Handles the authentication flow with GitHub provider

## Development

### Local Development

1. Install Deno: https://deno.land/manual@v1.28.3/getting_started/installation

2. Copy `.env.example` to `.env` and fill in your Supabase credentials.

3. Run a function locally:

```bash
deno run --allow-net --allow-env --allow-read ./auth-login/index.ts
```

### Deployment

To deploy a function to Supabase:

```bash
supabase functions deploy auth-login
```

## Type Checking

This project includes TypeScript declarations in `deno.types.d.ts` to help with editor integration.

## Import Map

The `import_map.json` file maps import specifiers to URL dependencies, making imports cleaner:

```typescript
// With import map
import { serve } from "http/server.ts";

// Without import map
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```
