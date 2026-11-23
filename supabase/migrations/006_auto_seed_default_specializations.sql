-- ============================================================================
-- EZ Center Portal: Auto-Seed Default Specializations for All Existing & Future Schools
-- Safe to run multiple times (idempotent) in the Supabase SQL Editor.
-- ============================================================================

-- 1. Idempotent helper inserting the 17 standard specializations for a given school.
--    Uses a case-insensitive, trimmed name check so existing specializations (such as
--    "Taekwondo" with existing students/rubrics) are preserved without duplication.
CREATE OR REPLACE FUNCTION public.seed_default_specializations_for_school(p_school_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  IF p_school_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.specializations (school_id, name, teacher_name)
  SELECT
    p_school_id,
    seed.name,
    ''
  FROM (
    VALUES
      ('GUITAR'),
      ('VIOLIN'),
      ('VOICE'),
      ('PIANO'),
      ('DRUMS'),
      ('BALLET'),
      ('HIPHOP'),
      ('ROBOTICS'),
      ('TAEKWONDO'),
      ('DRUM & LYRE'),
      ('SAXOPHONE'),
      ('SWIMMING'),
      ('UKULELE'),
      ('THEATER ARTS'),
      ('BADMINTON'),
      ('BASKETBALL'),
      ('VISUAL ARTS')
  ) AS seed(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.specializations sp
    WHERE sp.school_id = p_school_id
      AND lower(btrim(sp.name)) = lower(btrim(seed.name))
  );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_specializations_for_school(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_specializations_for_school(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_specializations_for_school(uuid) TO service_role;

-- 2. Trigger function firing automatically whenever a new school is added
CREATE OR REPLACE FUNCTION public.handle_new_school_specializations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.seed_default_specializations_for_school(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_school_specializations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_school_specializations() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_school_created_seed_specializations ON public.schools;
CREATE TRIGGER on_school_created_seed_specializations
  AFTER INSERT ON public.schools
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_school_specializations();

-- 3. Backfill all currently existing schools immediately
DO $$
DECLARE
  sch record;
BEGIN
  FOR sch IN
    SELECT id
    FROM public.schools
    ORDER BY created_at ASC, id ASC
  LOOP
    PERFORM public.seed_default_specializations_for_school(sch.id);
  END LOOP;
END;
$$;
