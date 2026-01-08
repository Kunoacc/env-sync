import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

function getSupabaseClient(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

async function getUser(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getOrCreateProject(supabase: ReturnType<typeof createClient>, userId: string, projectName: string) {
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('name', projectName)
    .single();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name: projectName })
    .select('id')
    .single();

  if (error) throw error;
  return created.id;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = getSupabaseClient(req);
  const user = await getUser(supabase);

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.replace('/files/', '').split('/');
  const projectName = decodeURIComponent(pathParts[0] || '');
  const fileName = decodeURIComponent(pathParts[1] || '');
  const action = pathParts[2] || '';

  if (!projectName) {
    return new Response(
      JSON.stringify({ error: 'Missing project name' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const projectId = await getOrCreateProject(supabase, user.id, projectName);

    if (!fileName) {
      const { data: files, error } = await supabase
        .from('env_files')
        .select('file_name, hash, updated_at')
        .eq('project_id', projectId);

      if (error) throw error;

      return new Response(
        JSON.stringify({ files }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (req.method) {
      case 'GET': {
        if (action === 'content') {
          const { data: file, error } = await supabase
            .from('env_files')
            .select('content, hash, updated_at')
            .eq('project_id', projectId)
            .eq('file_name', fileName)
            .single();

          if (error || !file) {
            return new Response(
              JSON.stringify({ error: 'File not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify(file),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (action === 'history') {
          const { data: file } = await supabase
            .from('env_files')
            .select('id, content, hash, updated_at')
            .eq('project_id', projectId)
            .eq('file_name', fileName)
            .single();

          if (!file) {
            return new Response(
              JSON.stringify({ history: [] }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { data: versions } = await supabase
            .from('env_file_versions')
            .select('id, hash, created_at')
            .eq('env_file_id', file.id)
            .order('created_at', { ascending: false })
            .limit(20);

          const history = [
            { id: 'current', hash: file.hash, timestamp: file.updated_at, isCurrent: true },
            ...(versions || []).map(v => ({
              id: v.id,
              hash: v.hash,
              timestamp: v.created_at,
              isCurrent: false,
            })),
          ];

          return new Response(
            JSON.stringify({ history }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: file, error } = await supabase
          .from('env_files')
          .select('hash, updated_at')
          .eq('project_id', projectId)
          .eq('file_name', fileName)
          .single();

        if (error || !file) {
          return new Response(
            JSON.stringify({ error: 'File not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify(file),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'PUT': {
        const body = await req.json();
        const { content, hash } = body;

        if (!content || !hash) {
          return new Response(
            JSON.stringify({ error: 'Missing content or hash' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: existing } = await supabase
          .from('env_files')
          .select('id')
          .eq('project_id', projectId)
          .eq('file_name', fileName)
          .single();

        if (existing) {
          const { error } = await supabase
            .from('env_files')
            .update({ content, hash })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('env_files')
            .insert({ project_id: projectId, file_name: fileName, content, hash });

          if (error) throw error;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'POST': {
        if (action === 'restore') {
          const body = await req.json();
          const { versionId } = body;

          if (!versionId) {
            return new Response(
              JSON.stringify({ error: 'Missing versionId' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { data: file } = await supabase
            .from('env_files')
            .select('id')
            .eq('project_id', projectId)
            .eq('file_name', fileName)
            .single();

          if (!file) {
            return new Response(
              JSON.stringify({ error: 'File not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { data: version, error: versionError } = await supabase
            .from('env_file_versions')
            .select('content, hash')
            .eq('id', versionId)
            .eq('env_file_id', file.id)
            .single();

          if (versionError || !version) {
            return new Response(
              JSON.stringify({ error: 'Version not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { error: updateError } = await supabase
            .from('env_files')
            .update({ content: version.content, hash: version.hash })
            .eq('id', file.id);

          if (updateError) throw updateError;

          return new Response(
            JSON.stringify({ success: true, content: version.content, hash: version.hash }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not found', { status: 404 });
      }

      case 'DELETE': {
        const { error } = await supabase
          .from('env_files')
          .delete()
          .eq('project_id', projectId)
          .eq('file_name', fileName);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response('Method not allowed', { status: 405 });
    }
  } catch (error) {
    console.error('Files error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
