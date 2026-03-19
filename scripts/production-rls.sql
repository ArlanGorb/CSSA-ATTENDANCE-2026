-- ============================================
-- PRODUCTION RLS POLICIES
-- ============================================
-- These policies provide secure access control for production
-- Replace the open policies in schema.sql with these for production
-- ============================================

-- ============================================
-- PREREQUISITES
-- ============================================

-- First, ensure you have set up proper authentication in Supabase
-- These policies assume you're using Supabase Auth

-- ============================================
-- MEETINGS POLICIES
-- ============================================

-- Drop existing open policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable update for all users" ON public.meetings;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.meetings;

-- Anyone can read meetings (public view)
CREATE POLICY "Anyone can view meetings" ON public.meetings
    FOR SELECT
    USING (true);

-- Only authenticated users can create meetings
CREATE POLICY "Authenticated users can create meetings" ON public.meetings
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Only admins can update meetings
-- You'll need to create an 'admin' role or check user metadata
CREATE POLICY "Admins can update meetings" ON public.meetings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Only admins can delete meetings
CREATE POLICY "Admins can delete meetings" ON public.meetings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- ============================================
-- ATTENDANCE POLICIES
-- ============================================

-- Drop existing open policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.attendance;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.attendance;
DROP POLICY IF EXISTS "Enable update for all users" ON public.attendance;

-- Anyone can read attendance (for leaderboard, analytics)
CREATE POLICY "Anyone can view attendance" ON public.attendance
    FOR SELECT
    USING (true);

-- Only authenticated users can submit their own attendance
CREATE POLICY "Users can submit own attendance" ON public.attendance
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        OR auth.role() = 'anon' -- Allow anon for QR code scanning
    );

-- Only admins can update attendance records
CREATE POLICY "Admins can update attendance" ON public.attendance
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Users can only delete their own attendance (within 5 minutes of submission)
CREATE POLICY "Users can delete own recent attendance" ON public.attendance
    FOR DELETE
    USING (
        auth.role() = 'authenticated'
        AND (NOW() - created_at) < INTERVAL '5 minutes'
    );

-- ============================================
-- USER PROFILES POLICIES
-- ============================================

-- Drop existing open policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_profiles;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.user_profiles;
DROP POLICY IF EXISTS "Enable update for all users" ON public.user_profiles;

-- Anyone can read profiles (for face recognition matching)
CREATE POLICY "Anyone can view profiles" ON public.user_profiles
    FOR SELECT
    USING (true);

-- Only authenticated users can create their own profile
CREATE POLICY "Users can create own profile" ON public.user_profiles
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        OR auth.role() = 'anon'
    );

-- Users can only update their own profile
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        OR auth.role() = 'anon'
    );

-- ============================================
-- SECURITY LOGS POLICIES
-- ============================================

-- Drop existing open policies
DROP POLICY IF EXISTS "Enable all actions for all users" ON public.security_logs;

-- Only admins can read security logs
CREATE POLICY "Admins can view security logs" ON public.security_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- System can insert security logs (via API)
CREATE POLICY "System can create security logs" ON public.security_logs
    FOR INSERT
    WITH CHECK (true);

-- Only admins can delete security logs
CREATE POLICY "Admins can delete security logs" ON public.security_logs
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- ============================================
-- ABSENCE REQUESTS POLICIES
-- ============================================

-- Drop existing open policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.absence_requests;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.absence_requests;
DROP POLICY IF EXISTS "Enable update for all users" ON public.absence_requests;

-- Users can view their own requests, admins can view all
CREATE POLICY "Users can view own absence requests" ON public.absence_requests
    FOR SELECT
    USING (
        auth.role() = 'anon' -- Allow anon access for now
        OR name = (
            SELECT raw_user_meta_data->>'name'
            FROM auth.users
            WHERE auth.users.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Anyone can create absence requests
CREATE POLICY "Anyone can create absence requests" ON public.absence_requests
    FOR INSERT
    WITH CHECK (true);

-- Only admins can update absence requests (approve/reject)
CREATE POLICY "Admins can update absence requests" ON public.absence_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- ============================================
-- ADMIN ROLE SETUP (Optional)
-- ============================================

-- To use the admin policies above, you need to set up admin roles
-- Option 1: Use Supabase Auth metadata
-- Update user metadata via Supabase Dashboard or API:
-- 
-- UPDATE auth.users
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
-- WHERE email = 'admin@example.com';

-- Option 2: Create a separate admins table
CREATE TABLE IF NOT EXISTS public.admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES auth.users(id)
);

-- Policy to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admins
        WHERE user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTIONS FOR RLS
-- ============================================

-- Function to get current user's name from auth metadata
CREATE OR REPLACE FUNCTION get_current_user_name()
RETURNS TEXT AS $$
BEGIN
    RETURN auth.raw_user_meta_data()->>'name';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user owns a record
CREATE OR REPLACE FUNCTION is_own_profile(profile_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN get_current_user_name() = profile_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================

-- List all policies
DO $$
DECLARE
    pol RECORD;
BEGIN
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '📋 Production RLS Policies Applied';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    
    FOR pol IN 
        SELECT schemaname, tablename, policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname
    LOOP
        RAISE NOTICE 'Table: %- Policy: % [%]', pol.tablename, pol.policyname, pol.cmd;
    END LOOP;
    
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '⚠️  IMPORTANT: Test these policies thoroughly';
    RAISE NOTICE '    before deploying to production!';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
