-- ============================================
-- PRESENSI CSSA - Database Migration Script
-- ============================================
-- This script creates and updates the database schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CORE TABLES
-- ============================================

-- Meetings Table
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,
    attendance_limit_minutes INTEGER NOT NULL DEFAULT 10,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 100,
    is_archived BOOLEAN DEFAULT FALSE,
    qr_token TEXT,
    qr_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    division TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Hadir', 'Late', 'Izin', 'Sakit', 'Alfa')),
    device_id TEXT,
    is_suspicious BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(meeting_id, name)
);

-- User Profiles Table (for Face Recognition)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    division TEXT NOT NULL,
    face_descriptor JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security Logs Table (Intrusion Detection)
CREATE TABLE IF NOT EXISTS public.security_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    division TEXT NOT NULL,
    device_id TEXT,
    threat_level TEXT DEFAULT 'HIGH',
    threat_type TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Absence Requests Table
CREATE TABLE IF NOT EXISTS public.absence_requests (
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

-- ============================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable update for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.meetings;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.attendance;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.attendance;
DROP POLICY IF EXISTS "Enable update for all users" ON public.attendance;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_profiles;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.user_profiles;
DROP POLICY IF EXISTS "Enable update for all users" ON public.user_profiles;

DROP POLICY IF EXISTS "Enable all actions for all users" ON public.security_logs;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.absence_requests;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.absence_requests;
DROP POLICY IF EXISTS "Enable update for all users" ON public.absence_requests;

-- Create policies (Development - Open Access)
-- For production, replace these with authenticated user policies
CREATE POLICY "Enable read access for all users" ON public.meetings 
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON public.meetings 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON public.meetings 
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete for all users" ON public.meetings 
    FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.attendance 
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON public.attendance 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON public.attendance 
    FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON public.user_profiles 
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON public.user_profiles 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON public.user_profiles 
    FOR UPDATE USING (true);

CREATE POLICY "Enable all actions for all users" ON public.security_logs 
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable read access for all users" ON public.absence_requests 
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON public.absence_requests 
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON public.absence_requests 
    FOR UPDATE USING (true);

-- ============================================
-- 3. PERFORMANCE INDEXES
-- ============================================

-- Meetings indexes
CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date);
CREATE INDEX IF NOT EXISTS idx_meetings_archived ON meetings(is_archived);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);

-- Attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_meeting_id ON attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendance_name ON attendance(name);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_device_id ON attendance(device_id);

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_name ON user_profiles(name);
CREATE INDEX IF NOT EXISTS idx_user_profiles_division ON user_profiles(division);

-- Security logs indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_meeting_id ON security_logs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_logs_threat_type ON security_logs(threat_type);

-- Absence requests indexes
CREATE INDEX IF NOT EXISTS idx_absence_requests_meeting ON absence_requests(meeting_id);
CREATE INDEX IF NOT EXISTS idx_absence_requests_name ON absence_requests(name);
CREATE INDEX IF NOT EXISTS idx_absence_requests_status ON absence_requests(status);
CREATE INDEX IF NOT EXISTS idx_absence_requests_created_at ON absence_requests(created_at);

-- ============================================
-- 4. ADDITIONAL COLUMNS (for backward compatibility)
-- ============================================

-- Add photo_url column to attendance if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance' 
        AND column_name = 'photo_url'
    ) THEN
        ALTER TABLE public.attendance ADD COLUMN photo_url TEXT;
    END IF;
END
$$;

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to auto-update reviewed_at timestamp
CREATE OR REPLACE FUNCTION update_reviewed_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reviewed_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for absence requests
DROP TRIGGER IF EXISTS trigger_update_reviewed_at ON public.absence_requests;
CREATE TRIGGER trigger_update_reviewed_at
    BEFORE UPDATE OF status ON public.absence_requests
    FOR EACH ROW
    WHEN (NEW.status = 'approved' OR NEW.status = 'rejected')
    EXECUTE FUNCTION update_reviewed_at_timestamp();

-- ============================================
-- 6. VERIFICATION
-- ============================================

-- Display table counts
DO $$
DECLARE
    meetings_count INTEGER;
    attendance_count INTEGER;
    profiles_count INTEGER;
    logs_count INTEGER;
    requests_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO meetings_count FROM public.meetings;
    SELECT COUNT(*) INTO attendance_count FROM public.attendance;
    SELECT COUNT(*) INTO profiles_count FROM public.user_profiles;
    SELECT COUNT(*) INTO logs_count FROM public.security_logs;
    SELECT COUNT(*) INTO requests_count FROM public.absence_requests;
    
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Database Migration Completed Successfully';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Table Statistics:';
    RAISE NOTICE '  - Meetings: %', meetings_count;
    RAISE NOTICE '  - Attendance: %', attendance_count;
    RAISE NOTICE '  - User Profiles: %', profiles_count;
    RAISE NOTICE '  - Security Logs: %', logs_count;
    RAISE NOTICE '  - Absence Requests: %', requests_count;
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
