-- EZ Center Portal: Core PostgreSQL Schema for Supabase
-- Run via `supabase db push` or Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. User Profiles (linked 1:1 to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'director', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));

-- 2. Schools
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Specializations inside each School
CREATE TABLE IF NOT EXISTS public.specializations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  teacher_name text NOT NULL DEFAULT '',
  teacher_photo_url text,
  assigned_teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_specializations_school_id ON public.specializations (school_id);
CREATE INDEX IF NOT EXISTS idx_specializations_teacher_id ON public.specializations (assigned_teacher_id);

-- 4. Teacher <-> School & Specialization Assignments
-- specialization_id IS NULL grants access to all specializations in that school.
-- specialization_id IS NOT NULL restricts the teacher strictly to that specialization.
CREATE TABLE IF NOT EXISTS public.teacher_school_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  specialization_id uuid REFERENCES public.specializations(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tsa_school_wide
  ON public.teacher_school_assignments (teacher_id, school_id)
  WHERE specialization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tsa_spec_exact
  ON public.teacher_school_assignments (teacher_id, school_id, specialization_id)
  WHERE specialization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tsa_teacher_id ON public.teacher_school_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_tsa_school_id ON public.teacher_school_assignments (school_id);

-- 5. Students
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  specialization_id uuid NOT NULL REFERENCES public.specializations(id) ON DELETE CASCADE,
  name text NOT NULL,
  roll_no text NOT NULL,
  grade_level text NOT NULL DEFAULT '',
  gender text NOT NULL DEFAULT '',
  contact_no text NOT NULL DEFAULT '',
  teacher_name text NOT NULL DEFAULT '',
  photo_url text,
  teacher_photo_url text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_school_spec ON public.students (school_id, specialization_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON public.students (school_id, roll_no);

-- 6. Daily Attendance Logs
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Absent')),
  marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance_logs (school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance_logs (student_id);

-- 7. Rubric Criteria
CREATE TABLE IF NOT EXISTS public.rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  specialization_id uuid NOT NULL REFERENCES public.specializations(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rubric_criteria_spec ON public.rubric_criteria (specialization_id, sort_order);

-- 8. Rubric Evaluations & Scores
CREATE TABLE IF NOT EXISTS public.rubric_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  eval_date date NOT NULL,
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, eval_date)
);

CREATE INDEX IF NOT EXISTS idx_rubric_evals_school_date ON public.rubric_evaluations (school_id, eval_date);
CREATE INDEX IF NOT EXISTS idx_rubric_evals_student ON public.rubric_evaluations (student_id);

CREATE TABLE IF NOT EXISTS public.rubric_scores (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES public.rubric_evaluations(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  score numeric(5,2) NOT NULL,
  UNIQUE (evaluation_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_rubric_scores_eval ON public.rubric_scores (evaluation_id);
CREATE INDEX IF NOT EXISTS idx_rubric_scores_criterion ON public.rubric_scores (criterion_id);

-- 9. System-wide Admin Customization Settings (singleton row id = 1)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  portal_name text NOT NULL DEFAULT 'EZ Center Portal',
  primary_color text NOT NULL DEFAULT '#6d28d9',
  attendance_threshold int NOT NULL DEFAULT 80 CHECK (attendance_threshold BETWEEN 1 AND 100),
  rubric_min int NOT NULL DEFAULT 1,
  rubric_max int NOT NULL DEFAULT 5,
  rubric_labels jsonb NOT NULL DEFAULT '{"1":"Beginning","2":"Developing","3":"Proficient","4":"Advanced","5":"Exemplary"}'::jsonb,
  custom_student_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  director_can_edit boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (rubric_max > rubric_min)
);

-- 10. Visual Query Presets
CREATE TABLE IF NOT EXISTS public.query_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_presets_owner ON public.query_presets (owner_id);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  school_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_id ON public.audit_logs (school_id, created_at DESC);
