-- ============================================
-- Quick Fix: Create Missing security_logs Table
-- ============================================
-- Copy dan paste ini ke Supabase SQL Editor
-- https://app.supabase.com/project/_/sql
-- ============================================

-- Create Security Logs Table (if not exists)
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

-- Enable RLS
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Enable all actions for all users" ON public.security_logs;

-- Create policy (Development - Open Access)
CREATE POLICY "Enable all actions for all users" ON public.security_logs
    FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_security_logs_meeting_id ON security_logs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_timestamp ON security_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_logs_threat_type ON security_logs(threat_type);

-- Verification
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'security_logs'
    ) INTO table_exists;
    
    IF table_exists THEN
        RAISE NOTICE '✅ security_logs table created successfully!';
    ELSE
        RAISE NOTICE '❌ Failed to create security_logs table';
    END IF;
END $$;
