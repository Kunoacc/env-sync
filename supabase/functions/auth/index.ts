import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace('/auth', '');

  try {
    switch (path) {
      case '/magic-link': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        const body = await req.json();
        const { email } = body;

        if (!email) {
          return new Response(
            JSON.stringify({ error: 'Email is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
          },
        });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Check your email for the login link' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case '/verify-otp': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        const body = await req.json();
        const { email, token } = body;

        if (!email || !token) {
          return new Response(
            JSON.stringify({ error: 'Email and token are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
        });

        if (error || !data.session) {
          return new Response(
            JSON.stringify({ error: error?.message || 'Invalid or expired token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            email: data.user?.email,
            user_id: data.user?.id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case '/login': {
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        const provider = url.searchParams.get('provider') || 'github';

        if (!redirectUri || !state) {
          return new Response(
            JSON.stringify({ error: 'Missing redirect_uri or state' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: provider as 'github' | 'google',
          options: {
            redirectTo: `${supabaseUrl}/functions/v1/auth/callback?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
          },
        });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return Response.redirect(data.url!, 302);
      }

      case '/callback': {
        const code = url.searchParams.get('code');
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');

        if (!code || !redirectUri || !state) {
          return new Response('Missing parameters', { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error || !data.session) {
          const errorRedirect = `${redirectUri}?error=${encodeURIComponent(error?.message || 'Unknown error')}&state=${state}`;
          return Response.redirect(errorRedirect, 302);
        }

        const successRedirect = `${redirectUri}?code=${data.session.access_token}&state=${state}`;
        return Response.redirect(successRedirect, 302);
      }

      case '/token': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        const body = await req.json();
        const { code } = body;

        if (!code) {
          return new Response(
            JSON.stringify({ error: 'Missing code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${code}` } },
        });

        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            access_token: code,
            email: user.email,
            user_id: user.id,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case '/validate': {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: 'Missing authorization header' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          return new Response(
            JSON.stringify({ valid: false }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ valid: true, email: user.email }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case '/logout': {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
          return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const token = authHeader.replace('Bearer ', '');
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });

        await supabase.auth.signOut();

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response('Not found', { status: 404 });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
