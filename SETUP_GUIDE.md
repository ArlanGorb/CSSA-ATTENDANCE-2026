# 🚀 Presensi CSSA - Complete Setup Guide

Complete setup and configuration guide for the CSSA BEM FILKOM Attendance System.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Storage Setup](#storage-setup)
6. [Development](#development)
7. [Production Deployment](#production-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- A **Supabase** account ([Sign up](https://supabase.com/))
- A code editor (VS Code recommended)

---

## Quick Start

```bash
# 1. Clone the repository
cd "D:\PRESENSI CSSA 26"

# 2. Install dependencies
npm install

# 3. Copy environment example file
cp .env.local.example .env.local

# 4. Edit .env.local with your Supabase credentials

# 5. Run database migration in Supabase SQL Editor
# (See Database Setup section below)

# 6. Start development server
npm run dev
```

Visit `http://localhost:3000` to see your application.

---

## Environment Configuration

### Step 1: Create `.env.local` file

```bash
cp .env.local.example .env.local
```

### Step 2: Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project (or create a new one)
3. Navigate to **Settings** → **API**
4. Copy the following values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 3: Optional - Service Role Key

For advanced features (storage bucket creation, admin operations):

- **Service Role Key** → `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **WARNING**: Never expose the service role key in client-side code!

### Step 4: Verify Configuration

```bash
node scripts/verify-db.js
```

This will check if your environment is properly configured.

---

## Database Setup

### Option A: Automatic Migration (Recommended)

1. Open Supabase Dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `scripts/migrate-db.sql`
5. Click **Run**

The script will:
- Create all required tables
- Set up indexes for performance
- Configure Row Level Security (RLS)
- Add helper functions and triggers

### Option B: Manual Setup

Run the original `schema.sql` file in Supabase SQL Editor.

### Verify Database

```bash
node scripts/verify-db.js
```

Expected output:
```
✅ Database verification completed successfully!
   All tables and columns are present.
```

---

## Storage Setup

### Option A: Automatic Setup (With Service Role Key)

1. Add your service role key to `.env.local`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Run the setup script:
   ```bash
   node scripts/setup-storage.js
   ```

### Option B: Manual Setup

1. Go to Supabase Dashboard → **Storage**
2. Create two new buckets:

#### Bucket 1: `attendance-photos`
- **Name**: `attendance-photos`
- **Public**: Yes
- **File Size Limit**: `5242880` (5MB)
- **Allowed MIME Types**: `image/jpeg, image/png, image/webp`

#### Bucket 2: `absence-attachments`
- **Name**: `absence-attachments`
- **Public**: Yes
- **File Size Limit**: `5242880` (5MB)
- **Allowed MIME Types**: `image/jpeg, image/png, image/webp, application/pdf`

### Set Bucket Policies

For each bucket, run this SQL in the SQL Editor:

```sql
-- Enable public read access
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT
USING (bucket_id = 'attendance-photos');

-- Enable uploads
CREATE POLICY "Enable Uploads" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'attendance-photos');

-- Enable deletes
CREATE POLICY "Enable Deletes" ON storage.objects
FOR DELETE
USING (bucket_id = 'attendance-photos');
```

Replace `'attendance-photos'` with `'absence-attachments'` for the second bucket.

---

## Development

### Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Available Routes

| Route | Description |
|-------|-------------|
| `/` | Home page with navigation |
| `/admin` | Admin dashboard (Password: `8182838485`) |
| `/profile` | User profile and attendance history |
| `/leaderboard` | Member rankings and points |
| `/analytics` | Analytics dashboard with charts |
| `/absence-request` | Submit absence requests |
| `/register` | Face registration for members |
| `/attend/[meetingId]` | Attendance check-in page |

### Admin Credentials

**Default Password**: `8182838485`

⚠️ **Change this in production!** Edit `src/app/admin/page.tsx` line ~77.

---

## Production Deployment

### 1. Environment Variables

Set these in your hosting platform (Vercel, Railway, etc.):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Enable Production RLS

For enhanced security, run the production RLS policies:

1. Navigate to Supabase SQL Editor
2. Copy contents of `scripts/production-rls.sql`
3. Run the script

⚠️ **Warning**: This enables authentication-based access control. Test thoroughly!

### 3. Build and Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

### 4. Recommended Hosting

- **Vercel** (Recommended): [Deploy](https://vercel.com/new)
- **Railway**: [Deploy](https://railway.app/)
- **Netlify**: [Deploy](https://www.netlify.com/)

All platforms support one-click deployment from GitHub.

---

## Troubleshooting

### Common Issues

#### 1. "Missing Supabase credentials"

**Solution**: 
```bash
cp .env.local.example .env.local
# Edit .env.local with your actual credentials
```

#### 2. "Table does not exist"

**Solution**: Run the database migration script in Supabase SQL Editor.

#### 3. "Storage bucket not found"

**Solution**: Create the required storage buckets manually (see Storage Setup section).

#### 4. "Rate limit exceeded"

**Solution**: This is normal behavior. Wait a minute and try again. The system limits:
- 5 requests per minute for attendance submission
- 20 requests per minute for face profile operations

#### 5. "Face detection not working"

**Solutions**:
- Ensure models are in `/public/models/` folder
- Check browser console for errors
- Use a modern browser (Chrome, Edge, Firefox)
- Ensure good lighting and camera access

#### 6. "QR Code expired"

**Solution**: 
- Admin: Refresh the QR code in the admin dashboard
- Member: Ask admin to refresh or re-scan the updated QR code

### Getting Help

1. Check the console for error messages
2. Run verification scripts:
   ```bash
   node scripts/verify-db.js
   ```
3. Review logs in Supabase Dashboard → **Logs**
4. Check browser DevTools Console (F12)

---

## Additional Scripts

### Database Verification
```bash
node scripts/verify-db.js
```

### Storage Setup
```bash
node scripts/setup-storage.js
```

### Check User Profiles
```bash
node check_user_profiles.js
```

### Check Database Connection
```bash
node check_db.js
```

---

## Security Best Practices

1. **Change Admin Password**: Edit `src/app/admin/page.tsx`
2. **Enable RLS**: Run `scripts/production-rls.sql`
3. **Use Environment Variables**: Never hardcode credentials
4. **Enable HTTPS**: Required for camera access
5. **Regular Backups**: Use Supabase's automated backups

---

## Features Overview

### For Members
- ✅ QR code-based attendance check-in
- ✅ Face recognition for identity verification
- ✅ Personal attendance history
- ✅ Points system (gamification)
- ✅ Absence request submission

### For Admins
- ✅ Meeting creation and management
- ✅ Real-time attendance monitoring
- ✅ QR code generation
- ✅ Attendance export (PDF/CSV)
- ✅ Absence request approval
- ✅ Analytics dashboard
- ✅ Security logs (intrusion detection)

---

## File Structure

```
D:\PRESENSI CSSA 26\
├── src/
│   ├── app/              # Next.js pages
│   │   ├── admin/        # Admin dashboard
│   │   ├── analytics/    # Analytics dashboard
│   │   ├── api/          # API routes
│   │   ├── attend/       # Attendance check-in
│   │   ├── leaderboard/  # Leaderboard page
│   │   ├── profile/      # User profile
│   │   └── register/     # Face registration
│   ├── components/       # React components
│   └── lib/              # Utilities (Supabase, rate-limit, etc.)
├── scripts/              # Setup and migration scripts
├── public/
│   └── models/           # Face-api.js models
├── .env.local.example    # Environment template
├── schema.sql           # Database schema
└── package.json
```

---

## Support

For issues or questions:
1. Check this README
2. Review error logs
3. Contact the development team

---

**Version**: 2.0.0  
**Last Updated**: March 2026  
**Maintained by**: CSSA Development Team
