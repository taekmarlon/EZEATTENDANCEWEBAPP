-- ============================================================================
-- EZ Center Portal: Migration 008
--   On-Device Face Recognition Attendance Support
--   1. Store compact face descriptor embeddings on public.students
--   2. Record verification_method & match_confidence on public.attendance_logs
--   3. Add face_recognition_settings JSON configuration on public.system_settings
-- ============================================================================

-- 1. Student Face Embeddings (up to 3 angle samples stored as float arrays)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS face_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS face_enrolled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_students_face_enrolled
  ON public.students (school_id, specialization_id)
  WHERE jsonb_array_length(face_descriptors) > 0;

-- 2. Attendance Verification Metadata (manual vs face_kiosk + confidence score)
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'manual'
    CHECK (verification_method IN ('manual', 'face_kiosk')),
  ADD COLUMN IF NOT EXISTS match_confidence numeric(5,4);

-- 3. Global Face Recognition Settings in system_settings (Admin configurable)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS face_recognition_settings jsonb NOT NULL DEFAULT
    '{"enabled":true,"matchThreshold":0.62,"requireLiveness":true,"requireBlinkChallenge":false,"cooldownSeconds":15,"soundEnabled":true}'::jsonb;
