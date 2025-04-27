import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Parse URL and get que  ry parameters
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const redirectUri = url.searchParams.get("redirect_uri");
  
  if (!state || !redirectUri) {
    return new Response(
      JSON.stringify({ error: "Missing state or redirect_uri" }),
      { status: 400, headers: { "Content-Type": "application/json" }}
    );
  }
  
  // Store state for validation
  const { error } = await supabase
    .from("auth_states")
    .insert({
      state: state,
      redirect_uri: redirectUri,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min expiry
    });
  
  if (error) {
    console.error("Error storing auth state:", error);
    return new Response(
      JSON.stringify({ error: "Failed to initiate auth" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  
  // Redirect to Supabase auth
  const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectUri)}&state=${state}`;
  
  return new Response(null, {
    status: 302,
    headers: { Location: authUrl }
  });
});