-- Tambahkan status absensi anggota.
-- Anggota dengan status Magang tidak akan dimasukkan ke Auto-Hadir maupun Mark Alfa.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'Aktif';

ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS user_profiles_attendance_status_check;

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_attendance_status_check
    CHECK (attendance_status IN ('Aktif', 'Magang'));
