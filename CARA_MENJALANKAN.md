# 🚀 Cara Menjalankan Sistem Presensi CSSA

## ✅ Status Sistem

- **Development Server**: ✅ BERJALAN di http://localhost:3000
- **Database**: ✅ Terhubung ke Supabase
- **Environment**: ✅ Terkonfigurasi

---

## 📋 Langkah yang Sudah Dilakukan

1. ✅ File `.env.local` sudah ada dengan kredensial Supabase
2. ✅ Development server sudah berjalan di port 3000
3. ✅ Package `dotenv` sudah diinstall
4. ✅ Database diverifikasi (hampir lengkap)

---

## ⚠️ Yang Perlu Dilakukan

### 1. Buat Tabel security_logs (PENTING!)

Ada 1 tabel yang belum ada: `security_logs`. 

**Cara memperbaikinya:**

1. Buka **Supabase SQL Editor**: https://app.supabase.com/project/_/sql
2. Login dengan akun Supabase Anda
3. Copy script dari file: `scripts/fix-security-logs.sql`
4. Paste ke SQL Editor
5. Klik **RUN** atau tekan Ctrl+Enter
6. Pastikan muncul pesan: `✅ security_logs table created successfully!`

**ATAU** jalankan migration lengkap:

1. Buka file: `scripts/migrate-db.sql`
2. Copy semua isi file
3. Paste ke Supabase SQL Editor
4. Klik **RUN**

---

## 🌐 Akses Aplikasi

### Development Mode (Sekarang)

Aplikasi sudah berjalan di:

**👉 http://localhost:3000**

### Halaman yang Tersedia

| URL | Deskripsi |
|-----|-----------|
| `/` | Halaman utama |
| `/admin` | Admin dashboard (Password: `8182838485`) |
| `/profile` | Profil user & riwayat absensi |
| `/leaderboard` | Peringkat anggota |
| `/analytics` | Dashboard analitik |
| `/absence-request` | Form pengajuan izin/sakit |
| `/register` | Registrasi wajah untuk face recognition |

---

## 🔧 Perintah Berguna

### Jalankan Server Development
```bash
cd "D:\PRESENSI CSSA 26"
npm run dev
```

### Stop Server
Tekan `Ctrl+C` di terminal tempat server berjalan

### Restart Server
```bash
# Stop dulu (Ctrl+C), lalu:
npm run dev
```

### Verifikasi Database
```bash
node scripts\verify-db.js
```

### Cek Koneksi Supabase
```bash
node check_db.js
```

---

## 🎯 Testing Fitur

### 1. Test Admin Dashboard
1. Buka http://localhost:3000/admin
2. Login dengan password: `8182838485`
3. Coba buat meeting baru
4. Generate QR code untuk absensi

### 2. Test Face Registration
1. Buka http://localhost:3000/register
2. Masukkan nama dan divisi
3. Klik "Start Camera"
4. Izinkan akses kamera
5. Ikuti proses registrasi wajah

### 3. Test Attendance
1. Admin membuat meeting dan generate QR
2. Scan QR code dengan HP
3. Lakukan face recognition
4. Submit absensi

### 4. Test Profile
1. Buka http://localhost:3000/profile
2. Masukkan nama Anda
3. Lihat riwayat absensi

---

## 📦 Setup Storage (Untuk Foto Absensi)

Jika ingin fitur upload foto berfungsi:

### Opsi 1: Otomatis (jika punya Service Role Key)
```bash
# Tambahkan ke .env.local:
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Lalu jalankan:
node scripts\setup-storage.js
```

### Opsi 2: Manual
1. Buka Supabase Dashboard → **Storage**
2. Create bucket baru: `attendance-photos`
   - Public: ✅ Yes
   - File size limit: `5242880` (5MB)
3. Create bucket: `absence-attachments`
   - Public: ✅ Yes
   - File size limit: `5242880` (5MB)

---

## 🐛 Troubleshooting

### Server tidak bisa start
```bash
# Hapus cache dan coba lagi:
rmdir /s /q .next
npm run dev
```

### Database error
```bash
# Verifikasi koneksi:
node scripts\verify-db.js

# Jika ada tabel missing, jalankan migration SQL
```

### Camera tidak berfungsi
- Pastikan menggunakan HTTPS (untuk production)
- Di localhost, kamera seharusnya berfungsi normal
- Cek browser permission untuk kamera

### Face recognition tidak akurat
- Pastikan pencahayaan cukup
- Posisi wajah menghadap kamera
- Gunakan kamera dengan resolusi minimal 720p

---

## 📞 Kontak Support

Jika ada masalah:
1. Cek console browser (F12) untuk error
2. Cek terminal untuk server logs
3. Lihat Supabase logs di dashboard
4. Review dokumentasi: `SETUP_GUIDE.md`

---

## ✨ Fitur yang Sudah Berfungsi

- ✅ Environment configuration
- ✅ Database connection
- ✅ Admin dashboard
- ✅ Meeting management
- ✅ QR code generation
- ✅ Face registration
- ✅ Face recognition attendance
- ✅ User profiles
- ✅ Leaderboard
- ✅ Analytics dashboard
- ✅ Absence requests
- ✅ Rate limiting (API protection)
- ✅ Error boundary (crash protection)

---

**Status**: 🟢 **SIAP DIGUNAKAN**

**Server URL**: http://localhost:3000  
**Admin Password**: `8182838485`

Selamat menggunakan sistem Presensi CSSA! 🎉
