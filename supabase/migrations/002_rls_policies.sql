-- EZ Center Portal: Row Level Security (RLS) & Storage Policies

-- Helper functions (SECURITY DEFINER with empty search_path for safe RLS evaluation)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (SELECT auth.uid()) AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.director_write_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT director_can_edit FROM public.system_settings WHERE id = 1),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_school_access(target_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.current_user_role() IN ('admin', 'director') THEN true
    WHEN public.current_user_role() = 'teacher' THEN EXISTS (
      SELECT 1
      FROM public.teacher_school_assignments a
      WHERE a.teacher_id = (SELECT auth.uid())
        AND a.school_id = target_school_id
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_specialization_access(target_school_id uuid, target_spec_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public.current_user_role() IN ('admin', 'director') THEN true
    WHEN public.current_user_role() = 'teacher' THEN EXISTS (
      SELECT 1
      FROM public.teacher_school_assignments a
      WHERE a.teacher_id = (SELECT auth.uid())
        AND a.school_id = target_school_id
        AND (a.specialization_id IS NULL OR a.specialization_id = target_spec_id)
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_student_access(target_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students st
    WHERE st.id = target_student_id
      AND public.has_specialization_access(st.school_id, st.specialization_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_school_structure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_write_allowed());
$$;

CREATE OR REPLACE FUNCTION public.can_write_academic_data(target_school_id uuid, target_spec_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    public.current_user_role() IN ('admin', 'teacher')
    OR (public.current_user_role() = 'director' AND public.director_write_allowed())
  ) AND public.has_specialization_access(target_school_id, target_spec_id);
$$;

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_school_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id OR public.current_user_role() IN ('admin', 'director'));

CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- TEACHER ASSIGNMENTS
CREATE POLICY "tsa_select_policy" ON public.teacher_school_assignments FOR SELECT
  USING (
    teacher_id = (SELECT auth.uid())
    OR public.current_user_role() IN ('admin', 'director')
  );

CREATE POLICY "tsa_admin_write" ON public.teacher_school_assignments FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- SCHOOLS
CREATE POLICY "schools_select_policy" ON public.schools FOR SELECT
  USING (public.has_school_access(id));

CREATE POLICY "schools_insert_policy" ON public.schools FOR INSERT
  WITH CHECK (public.can_write_school_structure());

CREATE POLICY "schools_update_policy" ON public.schools FOR UPDATE
  USING (public.can_write_school_structure())
  WITH CHECK (public.can_write_school_structure());

CREATE POLICY "schools_delete_policy" ON public.schools FOR DELETE
  USING (public.can_write_school_structure());

-- SPECIALIZATIONS
CREATE POLICY "specs_select_policy" ON public.specializations FOR SELECT
  USING (public.has_specialization_access(school_id, id));

CREATE POLICY "specs_insert_policy" ON public.specializations FOR INSERT
  WITH CHECK (public.can_write_school_structure());

CREATE POLICY "specs_update_policy" ON public.specializations FOR UPDATE
  USING (
    public.can_write_school_structure()
    OR (public.current_user_role() = 'teacher' AND public.has_specialization_access(school_id, id))
  )
  WITH CHECK (
    public.can_write_school_structure()
    OR (public.current_user_role() = 'teacher' AND public.has_specialization_access(school_id, id))
  );

CREATE POLICY "specs_delete_policy" ON public.specializations FOR DELETE
  USING (public.can_write_school_structure());

-- STUDENTS
CREATE POLICY "students_select_policy" ON public.students FOR SELECT
  USING (public.has_specialization_access(school_id, specialization_id));

CREATE POLICY "students_insert_policy" ON public.students FOR INSERT
  WITH CHECK (public.can_write_academic_data(school_id, specialization_id));

CREATE POLICY "students_update_policy" ON public.students FOR UPDATE
  USING (public.can_write_academic_data(school_id, specialization_id))
  WITH CHECK (public.can_write_academic_data(school_id, specialization_id));

CREATE POLICY "students_delete_policy" ON public.students FOR DELETE
  USING (public.can_write_academic_data(school_id, specialization_id));

-- ATTENDANCE LOGS
CREATE POLICY "attendance_select_policy" ON public.attendance_logs FOR SELECT
  USING (public.has_student_access(student_id));

CREATE POLICY "attendance_write_policy" ON public.attendance_logs FOR ALL
  USING (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  )
  WITH CHECK (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  );

-- RUBRIC CRITERIA
CREATE POLICY "criteria_select_policy" ON public.rubric_criteria FOR SELECT
  USING (public.has_specialization_access(school_id, specialization_id));

CREATE POLICY "criteria_write_policy" ON public.rubric_criteria FOR ALL
  USING (public.can_write_academic_data(school_id, specialization_id))
  WITH CHECK (public.can_write_academic_data(school_id, specialization_id));

-- RUBRIC EVALUATIONS
CREATE POLICY "evals_select_policy" ON public.rubric_evaluations FOR SELECT
  USING (public.has_student_access(student_id));

CREATE POLICY "evals_write_policy" ON public.rubric_evaluations FOR ALL
  USING (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  )
  WITH CHECK (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  );

-- RUBRIC SCORES
CREATE POLICY "scores_select_policy" ON public.rubric_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rubric_evaluations e
      WHERE e.id = evaluation_id AND public.has_student_access(e.student_id)
    )
  );

CREATE POLICY "scores_write_policy" ON public.rubric_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rubric_evaluations e
      WHERE e.id = evaluation_id AND public.has_student_access(e.student_id)
    )
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rubric_evaluations e
      WHERE e.id = evaluation_id AND public.has_student_access(e.student_id)
    )
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_write_allowed())
    )
  );

-- SYSTEM SETTINGS
CREATE POLICY "settings_select_policy" ON public.system_settings FOR SELECT
  USING (public.current_user_role() IS NOT NULL);

CREATE POLICY "settings_admin_write" ON public.system_settings FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- QUERY PRESETS
CREATE POLICY "presets_select_policy" ON public.query_presets FOR SELECT
  USING (owner_id = (SELECT auth.uid()) OR is_shared = true);

CREATE POLICY "presets_write_policy" ON public.query_presets FOR ALL
  USING (owner_id = (SELECT auth.uid()) OR public.current_user_role() = 'admin')
  WITH CHECK (owner_id = (SELECT auth.uid()) OR public.current_user_role() = 'admin');

-- AUDIT LOGS
CREATE POLICY "audit_select_policy" ON public.audit_logs FOR SELECT
  USING (public.current_user_role() IN ('admin', 'director'));

CREATE POLICY "audit_insert_policy" ON public.audit_logs FOR INSERT
  WITH CHECK (
    public.current_user_role() IS NOT NULL
    AND actor_id = (SELECT auth.uid())
  );

-- STORAGE BUCKET FOR SCHOOL LOGOS & PORTRAITS
INSERT INTO storage.buckets (id, name, public)
VALUES ('ez-media', 'ez-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ez_media_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'ez-media');

CREATE POLICY "ez_media_auth_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ez-media'
    AND public.current_user_role() IS NOT NULL
  );

CREATE POLICY "ez_media_auth_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'ez-media' AND public.current_user_role() IS NOT NULL);

CREATE POLICY "ez_media_auth_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'ez-media' AND public.current_user_role() IN ('admin', 'director', 'teacher'));
