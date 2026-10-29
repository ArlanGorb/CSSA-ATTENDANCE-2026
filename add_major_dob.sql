-- Tambahkan kolom major dan tanggal_lahir ke tabel user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS major TEXT,
ADD COLUMN IF NOT EXISTS tanggal_lahir DATE;

-- Karena noreg tidak digunakan lagi, kita bisa membiarkannya (jangan dihapus agar tidak merusak foreign key jika ada, meski tidak ada). 
-- Jika ada error unique constraint karena noreg kosong, jalankan ini (opsional):
-- ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_noreg_key;
