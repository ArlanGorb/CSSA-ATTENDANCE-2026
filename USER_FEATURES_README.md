# User Features Implementation - Presensi CSSA

## Overview
This document describes the new user features added to the Presensi CSSA attendance system.

## New Features Added

### 1. User Profile Page (`/profile`)
**Path:** `src/app/profile/page.tsx`

**Features:**
- **View Attendance History**: Users can search for their profile by name to see their complete attendance record
- **Statistics Dashboard**: Shows total Hadir, Late, Izin, Sakit, Alfa with attendance rate percentage
- **Points System**: Displays accumulated points (Hadir = 10pts, Late = 5pts)
- **Visual Charts**: Bar chart showing attendance distribution
- **Profile Edit**: Users can update their division
- **Recent Activity**: Shows last 5 attendance records
- **Full History Table**: Complete list of all attendance records with status badges

**Authentication:**
- Uses localStorage to remember user name
- "Change Account" button to switch users

### 2. Absence Request Form (`/absence-request`)
**Path:** `src/app/absence-request/page.tsx`

**Features:**
- **Submit Requests**: Students can submit Izin (permission) or Sakit (sick leave) requests
- **Meeting Selection**: Dropdown shows all active meetings
- **Division Selection**: Pre-populated CSSA divisions
- **File Upload**: Optional attachment for supporting documents (surat izin, medical certificate)
  - Max file size: 5MB
  - Supported formats: JPG, PNG
  - Images stored in Supabase Storage (`absence-attachments` bucket)
- **Request History**: Sidebar shows all submitted requests with status
- **Status Tracking**: Pending, Approved, or Rejected with admin notes

**Form Fields:**
- Full Name (auto-filled if previously searched)
- Division (dropdown)
- Meeting (dropdown with date)
- Absence Type (Izin/Sakit toggle)
- Reason (textarea)
- Attachment (optional image upload)

### 3. Admin Absence Review Panel
**Path:** `src/app/admin/page.tsx` (Updated)

**New Tab:** "Absence Requests"

**Features:**
- **Request List**: Table showing all absence requests
  - Student name & division
  - Meeting details
  - Absence type (Izin/Sakit)
  - Reason preview
  - Status badge (color-coded)
  - Quick action buttons (Approve/Reject)
- **Review Panel**: Detailed view when clicking a request
  - Full request details
  - Attachment preview/link
  - Admin note input
  - Approve/Reject buttons
- **Auto-Attendance**: When approved, automatically creates attendance record with appropriate status

**Actions:**
- Approve: Creates/updates attendance record with Izin/Sakit status
- Reject: Marks request as rejected with optional admin note
- View Attachment: Opens supporting document in new tab

### 4. Database Schema Updates
**Path:** `schema.sql`

**New Table:** `absence_requests`
```sql
CREATE TABLE public.absence_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    division TEXT NOT NULL,
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    absence_type TEXT NOT NULL CHECK (absence_type IN ('Izin', 'Sakit')),
    reason TEXT NOT NULL,
    attachment_url TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by TEXT
);
```

**Performance Indexes Added:**
- `idx_attendance_meeting_id`
- `idx_attendance_name`
- `idx_attendance_status`
- `idx_meetings_date`
- `idx_absence_requests_meeting`
- `idx_absence_requests_name`
- `idx_absence_requests_status`

### 5. Navigation Updates
**Path:** `src/app/page.tsx`

**New Home Page Cards:**
- **My Profile**: Access to personal attendance history
- **Absence Request**: Direct link to submit absence requests

## Setup Instructions

### 1. Database Migration
Run the updated schema in your Supabase SQL editor:
```bash
# Or apply schema.sql directly to your Supabase instance
```

### 2. Supabase Storage Setup
Create a new storage bucket for absence attachments:
- Bucket name: `absence-attachments`
- Public: true
- File size limit: 5MB
- Allowed MIME types: image/*

**Storage Policy:**
```sql
-- Enable public read access
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'absence-attachments');

-- Enable uploads
CREATE POLICY "Enable uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'absence-attachments');

-- Enable deletes
CREATE POLICY "Enable deletes" ON storage.objects FOR DELETE USING (bucket_id = 'absence-attachments');
```

### 3. Environment Variables
Ensure `.env.local` contains:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## User Flow

### For Students:
1. Visit `/profile` to view attendance history
2. Visit `/absence-request` to submit absence
3. Select meeting, type (Izin/Sakit), and provide reason
4. Optionally upload supporting document
5. Track request status in sidebar

### For Admins:
1. Login to `/admin`
2. Click "Absence Requests" tab
3. Review pending requests
4. Click request to see details
5. Add admin note (optional)
6. Approve or Reject
7. Approved requests automatically update attendance

## API Routes Used

### Existing:
- `/api/attendance` - For creating attendance records
- `/api/face-profiles` - For face recognition

### Storage:
- Supabase Storage API for file uploads

## Security Considerations

1. **File Upload Security:**
   - File size validation (max 5MB)
   - MIME type checking (images only)
   - Unique filename generation

2. **Data Validation:**
   - Required field checks
   - Status enum validation
   - Foreign key constraints

3. **RLS Policies:**
   - Currently open for development
   - Should be restricted in production

## Future Enhancements

1. **Email Notifications:**
   - Notify students when request is reviewed
   - Notify admins of new requests

2. **WhatsApp Integration:**
   - Send absence requests via WhatsApp
   - Receive approval notifications

3. **Advanced Analytics:**
   - Absence trends per division
   - Peak absence periods
   - Request approval rates

4. **Bulk Operations:**
   - Bulk approve/reject requests
   - Export absence reports

## File Structure
```
src/app/
├── profile/
│   └── page.tsx          # User profile & attendance history
├── absence-request/
│   └── page.tsx          # Absence request form
├── admin/
│   └── page.tsx          # Updated with absence review tab
└── page.tsx              # Updated with new navigation cards
```

## Testing Checklist

- [ ] Profile page loads with attendance data
- [ ] Profile edit updates division successfully
- [ ] Absence request form submits correctly
- [ ] File upload works for attachments
- [ ] Admin can view all requests
- [ ] Admin can approve requests
- [ ] Admin can reject requests
- [ ] Approved requests create attendance records
- [ ] Request history shows correct status
- [ ] Navigation links work from home page

## Build Status
✅ Build successful - No errors
⚠️ Minor ESLint warnings (non-critical)
- React Hook dependencies (performance optimization)
- Image optimization suggestions

---
**Version:** 1.0.0
**Last Updated:** March 2026
