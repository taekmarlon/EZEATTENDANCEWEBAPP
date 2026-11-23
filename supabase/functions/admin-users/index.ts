// Supabase Edge Function: Admin User, Role & Password Management
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

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
      return jsonResponse({ error: 'Server environment is missing Supabase keys.' }, 500);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('email, role, is_active')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Forbidden: Admin privileges required.' }, 403);
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
        return jsonResponse(
          { error: 'Valid email and password (min 8 chars) are required.' },
          400
        );
      }
      if (role !== 'teacher' && role !== 'director' && role !== 'admin') {
        return jsonResponse({ error: 'Invalid role.' }, 400);
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created.user) {
        return jsonResponse({ error: createErr?.message || 'Failed to create user.' }, 400);
      }

      const { error: profErr } = await adminClient.from('profiles').upsert({
        id: created.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      });
      if (profErr) {
        return jsonResponse({ error: profErr.message }, 400);
      }

      if (role === 'teacher' && assignments.length > 0) {
        const { error: assignErr } = await adminClient.from('teacher_school_assignments').insert(
          assignments.map((a) => ({
            teacher_id: created.user!.id,
            school_id: a.schoolId,
            specialization_id: a.specializationId || null,
            assigned_by: caller.id,
          }))
        );
        if (assignErr) {
          return jsonResponse({ error: assignErr.message }, 400);
        }
      }

      await adminClient.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: callerProfile.email ?? caller.email ?? null,
        actor_role: callerProfile.role,
        action: 'CREATE_USER',
        entity_type: 'profiles',
        entity_id: created.user.id,
        metadata: { email, role, assignmentCount: assignments.length },
      });

      return jsonResponse({ userId: created.user.id });
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
        return jsonResponse({ error: 'userId is required.' }, 400);
      }

      const patch: Record<string, unknown> = {
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };
      if (role === 'teacher' || role === 'director' || role === 'admin') {
        patch.role = role;
      }
      if (fullName !== undefined) {
        patch.full_name = fullName;
      }

      const { error: updErr } = await adminClient.from('profiles').update(patch).eq('id', userId);
      if (updErr) {
        return jsonResponse({ error: updErr.message }, 400);
      }

      if (assignments !== undefined) {
        const { error: delAssignErr } = await adminClient
          .from('teacher_school_assignments')
          .delete()
          .eq('teacher_id', userId);
        if (delAssignErr) {
          return jsonResponse({ error: delAssignErr.message }, 400);
        }
        if (assignments.length > 0) {
          const { error: insAssignErr } = await adminClient
            .from('teacher_school_assignments')
            .insert(
              assignments.map((a) => ({
                teacher_id: userId,
                school_id: a.schoolId,
                specialization_id: a.specializationId || null,
                assigned_by: caller.id,
              }))
            );
          if (insAssignErr) {
            return jsonResponse({ error: insAssignErr.message }, 400);
          }
        }
      }

      return jsonResponse({ ok: true });
    }

    if (action === 'reset_password') {
      const userId = String(body.userId || '');
      const password = String(body.password || '');
      if (!userId || password.length < 8) {
        return jsonResponse(
          { error: 'userId and a new password (min 8 chars) are required.' },
          400
        );
      }

      const { error: resetErr } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (resetErr) {
        return jsonResponse({ error: resetErr.message }, 400);
      }

      await adminClient.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: callerProfile.email ?? caller.email ?? null,
        actor_role: callerProfile.role,
        action: 'ADMIN_RESET_PASSWORD',
        entity_type: 'profiles',
        entity_id: userId,
        metadata: {},
      });

      return jsonResponse({ ok: true });
    }

    if (action === 'delete_user') {
      const userId = String(body.userId || '');
      if (!userId) {
        return jsonResponse({ error: 'userId is required.' }, 400);
      }
      if (userId === caller.id) {
        return jsonResponse({ error: 'You cannot delete your own active Admin account.' }, 400);
      }

      const { error: delErr } = await adminClient.auth.admin.deleteUser(userId);
      if (delErr) {
        return jsonResponse({ error: delErr.message }, 400);
      }

      await adminClient.from('audit_logs').insert({
        actor_id: caller.id,
        actor_email: callerProfile.email ?? caller.email ?? null,
        actor_role: callerProfile.role,
        action: 'DELETE_USER',
        entity_type: 'profiles',
        entity_id: userId,
        metadata: {},
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      500
    );
  }
});
