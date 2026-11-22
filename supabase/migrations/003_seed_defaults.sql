-- EZ Center Portal: Default System Settings & Safe Auth Profile Trigger

INSERT INTO public.system_settings (
  id,
  portal_name,
  primary_color,
  attendance_threshold,
  rubric_min,
  rubric_max,
  rubric_labels,
  custom_student_fields,
  director_can_edit
)
VALUES (
  1,
  'EZ Center Portal',
  '#6d28d9',
  80,
  1,
  5,
  '{"1":"Beginning","2":"Developing","3":"Proficient","4":"Advanced","5":"Exemplary"}'::jsonb,
  '[]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Automatically create a profiles row when a new auth.users entry is created.
-- Note: First user ever created becomes 'admin' to allow initial setup; all subsequent
-- self-signups default strictly to 'teacher' unless elevated by an Admin via Edge Function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_admin_count int;
  assigned_role text;
BEGIN
  SELECT count(*) INTO existing_admin_count FROM public.profiles WHERE role = 'admin';
  IF existing_admin_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'teacher';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    assigned_role,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
