-- ============================================================================
-- EZ Center Portal: Migration 007
--   1. Make students.roll_no optional (default empty string '')
--   2. Safe self-service profile update RPC (update_my_profile) for Teachers/Directors/Admins
--      so logged-in users can update their own full_name and avatar_url without
--      exposing role or is_active privilege escalation.
-- ============================================================================

-- 1. Ensure Roll / ID No. defaults cleanly to '' when omitted
ALTER TABLE public.students
  ALTER COLUMN roll_no SET DEFAULT '';

UPDATE public.students
SET roll_no = ''
WHERE roll_no IS NULL;

-- 2. Authenticated self-profile update RPC (name & portrait photo only)
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text,
  p_avatar_url text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  cleaned_name text := btrim(COALESCE(p_full_name, ''));
  cleaned_avatar text := NULLIF(btrim(COALESCE(p_avatar_url, '')), '');
  updated_row public.profiles;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF cleaned_name = '' THEN
    RAISE EXCEPTION 'Full name cannot be empty';
  END IF;

  UPDATE public.profiles
  SET
    full_name = cleaned_name,
    avatar_url = cleaned_avatar,
    updated_at = now()
  WHERE id = caller_id
    AND is_active = true
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active profile record not found for current user';
  END IF;

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated, service_role;
