-- =============================================
-- Special Events (Study Bible & Doa Subuh)
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Tabel untuk event khusus (Study Bible, Doa Subuh, dll.)
CREATE TABLE IF NOT EXISTS public.special_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('Study Bible', 'Doa Subuh', 'Lainnya')),
    date DATE NOT NULL,
    description TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabel kehadiran untuk special events
CREATE TABLE IF NOT EXISTS public.special_event_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.special_events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    division TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Hadir', 'Alfa', 'Izin', 'Sakit')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, name)
);

-- 3. Enable RLS
ALTER TABLE public.special_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_event_attendance ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Enable read access for all users" ON public.special_events FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.special_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.special_events FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.special_events FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.special_event_attendance FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.special_event_attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.special_event_attendance FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.special_event_attendance FOR DELETE USING (true);

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_special_events_date ON special_events(date);
CREATE INDEX IF NOT EXISTS idx_special_events_type ON special_events(event_type);
CREATE INDEX IF NOT EXISTS idx_special_event_att_event_id ON special_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_special_event_att_name ON special_event_attendance(name);
CREATE INDEX IF NOT EXISTS idx_special_event_att_status ON special_event_attendance(status);
