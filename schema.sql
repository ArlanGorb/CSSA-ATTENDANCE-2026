-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create Meetings Table
CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TEXT NOT NULL, -- Stored as "HH:mm"
    attendance_limit_minutes INTEGER NOT NULL DEFAULT 10,
    latitude DOUBLE PRECISION, -- Geolocation support
    longitude DOUBLE PRECISION,
    radius_meters INTEGER DEFAULT 100, -- Default 100 meters
    is_archived BOOLEAN DEFAULT FALSE,
    qr_token TEXT,
    qr_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Attendance Table
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    division TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Hadir', 'Late', 'Izin', 'Sakit', 'Alfa')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(meeting_id, name) -- Prevent double submission by name for same meeting
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for development - Open Access)
-- In production, you'd restrict these to authenticated users
CREATE POLICY "Enable read access for all users" ON public.meetings FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.meetings FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.meetings FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.meetings FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.attendance FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.attendance FOR UPDATE USING (true);
