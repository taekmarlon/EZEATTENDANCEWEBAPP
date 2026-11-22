-- ============================================================================
-- EZ Center Portal: Schema/Table GRANTs, Profile Recovery & Existing-User Backfill
-- Run this in the Supabase SQL Editor to grant PostgREST table/sequence/function
-- privileges to `authenticated` and ensure every auth.users row has a profile.
-- ============================================================================

-- 0. Grant schema, table, sequence & helper function privileges for Supabase Data API
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.schools,
  public.specializations,
  public.teacher_school_assignments,
  public.students,
  public.attendance_logs,
  public.rubric_criteria,
  public.rubric_evaluations,
  public.rubric_scores,
  public.query_presets
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.current_user_role(),
  public.director_write_allowed(),
  public.has_school_access(uuid),
  public.has_specialization_access(uuid, uuid),
  public.has_student_access(uuid),
  public.can_write_school_structure(),
  public.can_write_academic_data(uuid, uuid)
TO authenticated, service_role;

-- 1. Internal helper: idempotently provision a profile row (not callable by clients)
CREATE OR REPLACE FUNCTION public.provision_profile_for_user(
  target_user_id uuid,
  target_email text,
  target_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_row public.profiles;
  existing_admin_count int;
  assigned_role text;
BEGIN
  SELECT * INTO profile_row FROM public.profiles WHERE id = target_user_id;
  IF FOUND THEN
    RETURN profile_row;
  END IF;

  PERFORM pg_advisory_xact_lock(948271);

  SELECT * INTO profile_row FROM public.profiles WHERE id = target_user_id;
  IF FOUND THEN
    RETURN profile_row;
  END IF;

  SELECT count(*) INTO existing_admin_count FROM public.profiles WHERE role = 'admin';
  assigned_role := CASE WHEN existing_admin_count = 0 THEN 'admin' ELSE 'teacher' END;

  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    target_user_id,
    COALESCE(target_email, ''),
    COALESCE(
      NULLIF(trim(COALESCE(target_meta ->> 'full_name', '')), ''),
      NULLIF(split_part(COALESCE(target_email, ''), '@', 1), ''),
      'User'
    ),
    assigned_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO profile_row FROM public.profiles WHERE id = target_user_id;
  RETURN profile_row;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_profile_for_user(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_profile_for_user(uuid, text, jsonb) FROM anon, authenticated;

-- 2. Serialize trigger-based profile creation via the shared helper
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.provision_profile_for_user(NEW.id, NEW.email, NEW.raw_user_meta_data);
  RETURN NEW;
END;
$$;

-- 3. Self-healing RPC callable by authenticated sessions when public.profiles row is missing
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  auth_row record;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, email, raw_user_meta_data
  INTO auth_row
  FROM auth.users
  WHERE id = caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated account record not found in auth.users';
  END IF;

  RETURN public.provision_profile_for_user(
    auth_row.id,
    auth_row.email,
    auth_row.raw_user_meta_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- 4. Idempotent backfill for auth.users created before triggers/migrations were applied
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
    ORDER BY au.created_at ASC, au.id ASC
  LOOP
    PERFORM public.provision_profile_for_user(u.id, u.email, u.raw_user_meta_data);
  END LOOP;
END;
$$;
