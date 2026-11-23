-- ============================================================================
-- EZ Center Portal: Granular Director Permissions, Co-Teaching (Max 2 Teachers),
-- Director Specialization Assignment RLS, and Shared Co-Teacher Roster RPC
-- ============================================================================

-- 1. Granular Director permissions JSONB column on system_settings
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS director_permissions jsonb NOT NULL DEFAULT '{
    "canCreateSchools": true,
    "canEditSchools": true,
    "canDeleteSchools": true,
    "canCreateSpecializations": true,
    "canEditSpecializations": true,
    "canDeleteSpecializations": true,
    "canAssignTeachers": true,
    "canManageStudents": true,
    "canDeleteStudents": true,
    "canManageAttendanceAndRubrics": true,
    "canConfigureRubrics": true,
    "canDeleteEvaluationsOrCriteria": true,
    "canExportReports": true
  }'::jsonb;

-- Keep row id=1 consistent with director_can_edit if previously turned off
UPDATE public.system_settings
SET director_permissions = CASE
  WHEN director_can_edit = false THEN '{
    "canCreateSchools": false,
    "canEditSchools": false,
    "canDeleteSchools": false,
    "canCreateSpecializations": false,
    "canEditSpecializations": false,
    "canDeleteSpecializations": false,
    "canAssignTeachers": false,
    "canManageStudents": false,
    "canDeleteStudents": false,
    "canManageAttendanceAndRubrics": false,
    "canConfigureRubrics": false,
    "canDeleteEvaluationsOrCriteria": false,
    "canExportReports": true
  }'::jsonb
  ELSE director_permissions
END
WHERE id = 1;

-- 2. Granular permission helper for RLS policies
CREATE OR REPLACE FUNCTION public.director_has_permission(perm_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT s.director_can_edit
        AND COALESCE((s.director_permissions ->> perm_key)::boolean, true)
      FROM public.system_settings s
      WHERE s.id = 1
    ),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.director_has_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_has_permission(text) TO authenticated, service_role;

-- 3. Enforce max 2 co-teachers assigned per specialization
CREATE OR REPLACE FUNCTION public.enforce_max_two_teachers_per_spec()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_count int;
BEGIN
  IF NEW.specialization_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.specialization_id::text));
    SELECT count(DISTINCT teacher_id)
    INTO existing_count
    FROM public.teacher_school_assignments
    WHERE school_id = NEW.school_id
      AND specialization_id = NEW.specialization_id
      AND teacher_id <> NEW.teacher_id;

    IF existing_count >= 2 THEN
      RAISE EXCEPTION 'At most 2 co-teachers can be assigned to a single specialization.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_two_teachers ON public.teacher_school_assignments;
CREATE TRIGGER trg_enforce_max_two_teachers
  BEFORE INSERT OR UPDATE ON public.teacher_school_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_two_teachers_per_spec();

-- 4. Privacy-preserving RPC returning co-teachers only for specializations the caller accesses
CREATE OR REPLACE FUNCTION public.list_shared_specialization_teachers()
RETURNS TABLE (
  specialization_id uuid,
  teacher_id uuid,
  full_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT
    sp.id AS specialization_id,
    p.id AS teacher_id,
    p.full_name,
    p.avatar_url
  FROM public.specializations sp
  JOIN public.teacher_school_assignments a
    ON a.school_id = sp.school_id
   AND (a.specialization_id = sp.id OR a.specialization_id IS NULL)
  JOIN public.profiles p
    ON p.id = a.teacher_id
   AND p.role = 'teacher'
   AND p.is_active = true
  WHERE public.has_specialization_access(sp.school_id, sp.id)
  ORDER BY sp.id, p.full_name;
$$;

REVOKE ALL ON FUNCTION public.list_shared_specialization_teachers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_shared_specialization_teachers() TO authenticated, service_role;

-- 5. Update RLS policies for granular Director permissions & Director teacher assignment controls

-- SCHOOLS
DROP POLICY IF EXISTS "schools_insert_policy" ON public.schools;
CREATE POLICY "schools_insert_policy" ON public.schools FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canCreateSchools'))
  );

DROP POLICY IF EXISTS "schools_update_policy" ON public.schools;
CREATE POLICY "schools_update_policy" ON public.schools FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canEditSchools'))
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canEditSchools'))
  );

DROP POLICY IF EXISTS "schools_delete_policy" ON public.schools;
CREATE POLICY "schools_delete_policy" ON public.schools FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canDeleteSchools'))
  );

-- SPECIALIZATIONS
DROP POLICY IF EXISTS "specs_insert_policy" ON public.specializations;
CREATE POLICY "specs_insert_policy" ON public.specializations FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canCreateSpecializations'))
  );

DROP POLICY IF EXISTS "specs_update_policy" ON public.specializations;
CREATE POLICY "specs_update_policy" ON public.specializations FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canEditSpecializations'))
    OR (public.current_user_role() = 'teacher' AND public.has_specialization_access(school_id, id))
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canEditSpecializations'))
    OR (public.current_user_role() = 'teacher' AND public.has_specialization_access(school_id, id))
  );

DROP POLICY IF EXISTS "specs_delete_policy" ON public.specializations;
CREATE POLICY "specs_delete_policy" ON public.specializations FOR DELETE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'director' AND public.director_has_permission('canDeleteSpecializations'))
  );

-- TEACHER ASSIGNMENTS (Admin full write + Director specialization-level assignment when allowed)
DROP POLICY IF EXISTS "tsa_admin_write" ON public.teacher_school_assignments;
DROP POLICY IF EXISTS "tsa_admin_all" ON public.teacher_school_assignments;
DROP POLICY IF EXISTS "tsa_director_assign_insert" ON public.teacher_school_assignments;
DROP POLICY IF EXISTS "tsa_director_assign_delete" ON public.teacher_school_assignments;

CREATE POLICY "tsa_admin_all" ON public.teacher_school_assignments FOR ALL
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "tsa_director_assign_insert" ON public.teacher_school_assignments FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'director'
    AND public.director_has_permission('canAssignTeachers')
    AND specialization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = teacher_id AND p.role = 'teacher' AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.specializations sp
      WHERE sp.id = specialization_id AND sp.school_id = school_id
    )
  );

CREATE POLICY "tsa_director_assign_delete" ON public.teacher_school_assignments FOR DELETE
  USING (
    public.current_user_role() = 'director'
    AND public.director_has_permission('canAssignTeachers')
    AND specialization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = teacher_id AND p.role = 'teacher'
    )
  );

-- STUDENTS
DROP POLICY IF EXISTS "students_insert_policy" ON public.students;
CREATE POLICY "students_insert_policy" ON public.students FOR INSERT
  WITH CHECK (
    (
      public.current_user_role() = 'admin'
      OR (public.current_user_role() = 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageStudents'))
    )
    AND public.has_specialization_access(school_id, specialization_id)
  );

DROP POLICY IF EXISTS "students_update_policy" ON public.students;
CREATE POLICY "students_update_policy" ON public.students FOR UPDATE
  USING (
    (
      public.current_user_role() = 'admin'
      OR (public.current_user_role() = 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageStudents'))
    )
    AND public.has_specialization_access(school_id, specialization_id)
  )
  WITH CHECK (
    (
      public.current_user_role() = 'admin'
      OR (public.current_user_role() = 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageStudents'))
    )
    AND public.has_specialization_access(school_id, specialization_id)
  );

DROP POLICY IF EXISTS "students_delete_policy" ON public.students;
CREATE POLICY "students_delete_policy" ON public.students FOR DELETE
  USING (
    (
      public.current_user_role() = 'admin'
      OR (public.current_user_role() = 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canDeleteStudents'))
    )
    AND public.has_specialization_access(school_id, specialization_id)
  );

-- ATTENDANCE LOGS
DROP POLICY IF EXISTS "attendance_write_policy" ON public.attendance_logs;
CREATE POLICY "attendance_write_policy" ON public.attendance_logs FOR ALL
  USING (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  )
  WITH CHECK (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  );

-- RUBRIC CRITERIA
DROP POLICY IF EXISTS "criteria_write_policy" ON public.rubric_criteria;
DROP POLICY IF EXISTS "criteria_insert_policy" ON public.rubric_criteria;
DROP POLICY IF EXISTS "criteria_update_policy" ON public.rubric_criteria;
DROP POLICY IF EXISTS "criteria_delete_policy" ON public.rubric_criteria;

CREATE POLICY "criteria_insert_policy" ON public.rubric_criteria FOR INSERT
  WITH CHECK (
    public.has_specialization_access(school_id, specialization_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canConfigureRubrics'))
    )
  );

CREATE POLICY "criteria_update_policy" ON public.rubric_criteria FOR UPDATE
  USING (
    public.has_specialization_access(school_id, specialization_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canConfigureRubrics'))
    )
  )
  WITH CHECK (
    public.has_specialization_access(school_id, specialization_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canConfigureRubrics'))
    )
  );

CREATE POLICY "criteria_delete_policy" ON public.rubric_criteria FOR DELETE
  USING (
    public.has_specialization_access(school_id, specialization_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canDeleteEvaluationsOrCriteria'))
    )
  );

-- RUBRIC EVALUATIONS
DROP POLICY IF EXISTS "evals_write_policy" ON public.rubric_evaluations;
DROP POLICY IF EXISTS "evals_insert_policy" ON public.rubric_evaluations;
DROP POLICY IF EXISTS "evals_update_policy" ON public.rubric_evaluations;
DROP POLICY IF EXISTS "evals_delete_policy" ON public.rubric_evaluations;

CREATE POLICY "evals_insert_policy" ON public.rubric_evaluations FOR INSERT
  WITH CHECK (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  );

CREATE POLICY "evals_update_policy" ON public.rubric_evaluations FOR UPDATE
  USING (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  )
  WITH CHECK (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  );

CREATE POLICY "evals_delete_policy" ON public.rubric_evaluations FOR DELETE
  USING (
    public.has_student_access(student_id)
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canDeleteEvaluationsOrCriteria'))
    )
  );

-- RUBRIC SCORES
DROP POLICY IF EXISTS "scores_write_policy" ON public.rubric_scores;
CREATE POLICY "scores_write_policy" ON public.rubric_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.rubric_evaluations e
      WHERE e.id = evaluation_id AND public.has_student_access(e.student_id)
    )
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (
        public.current_user_role() = 'director'
        AND (
          public.director_has_permission('canManageAttendanceAndRubrics')
          OR public.director_has_permission('canDeleteEvaluationsOrCriteria')
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rubric_evaluations e
      WHERE e.id = evaluation_id AND public.has_student_access(e.student_id)
    )
    AND (
      public.current_user_role() IN ('admin', 'teacher')
      OR (public.current_user_role() = 'director' AND public.director_has_permission('canManageAttendanceAndRubrics'))
    )
  );
