// Supabase Edge Function: Admin User & Role Management
// Deploy via: supabase functions deploy admin-users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssignmentInput {
  schoolId: string;
  specializationId: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Server environment is missing Supabase keys.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin privileges required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'create_user') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const fullName = String(body.fullName || '').trim();
      const role = body.role;
      const assignments: AssignmentInput[] = Array.isArray(body.assignments) ? body.assignments : [];

      if (!email || password.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Valid email and password (min 8 chars) are required.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (role !== 'teacher' && role !== 'director' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Invalid role.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message || 'Failed to create user.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await adminClient
        .from('profiles')
        .upsert({
          id: created.user.id,
          email,
          full_name: fullName,
          role,
          is_active: true,
        });

      if (role === 'teacher' && assignments.length > 0) {
        await adminClient.from('teacher_school_assignments').insert(
          assignments.map((a) => ({
            teacher_id: created.user!.id,
            school_id: a.schoolId,
            specialization_id: a.specializationId || null,
            assigned_by: caller.id,
          }))
        );
      }

      return new Response(JSON.stringify({ userId: created.user.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_user') {
      const userId = String(body.userId || '');
      const role = body.role;
      const isActive = Boolean(body.isActive);
      const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined;
      const assignments: AssignmentInput[] | undefined = Array.isArray(body.assignments)
        ? body.assignments
        : undefined;

      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId is required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const patch: Record<string, unknown> = { is_active: isActive, updated_at: new Date().toISOString() };
      if (role === 'teacher' || role === 'director' || role === 'admin') {
        patch.role = role;
      }
      if (fullName !== undefined) {
        patch.full_name = fullName;
      }

      const { error: updErr } = await adminClient.from('profiles').update(patch).eq('id', userId);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (assignments !== undefined) {
        await adminClient.from('teacher_school_assignments').delete().eq('teacher_id', userId);
        if (assignments.length > 0) {
          await adminClient.from('teacher_school_assignments').insert(
            assignments.map((a) => ({
              teacher_id: userId,
              school_id: a.schoolId,
              specialization_id: a.specializationId || null,
              assigned_by: caller.id,
            }))
          );
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unsupported action.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected server error.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
