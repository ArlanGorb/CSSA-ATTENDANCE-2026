-- Tambahkan kolom noreg pada user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS noreg TEXT UNIQUE;

-- (Opsional) Hapus kolom face_descriptor karena tidak dipakai lagi
-- ALTER TABLE public.user_profiles DROP COLUMN IF NOT EXISTS face_descriptor;

-- Update kebijakan RLS (jika diperlukan)
-- Tidak ada perubahan RLS karena sudah mengizinkan SELECT, INSERT, UPDATE untuk public.
