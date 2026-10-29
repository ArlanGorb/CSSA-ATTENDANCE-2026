import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin-auth';

// GET: Fetch attendance for a specific event, or all attendance for a member
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const name = searchParams.get('name');

    // Fetch attendance by member name (for profile page)
    if (name) {
      const { data, error } = await supabase
        .from('special_event_attendance')
        .select(`
          *,
          special_events (
            id,
            title,
            event_type,
            date
          )
        `)
        .ilike('name', name.trim())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ attendance: data });
    }

    // Fetch attendance by event id (for admin management)
    if (eventId) {
      const { data, error } = await supabase
        .from('special_event_attendance')
        .select('*')
        .eq('event_id', eventId)
        .order('name', { ascending: true });

      if (error) throw error;
      return NextResponse.json({ attendance: data });
    }

    // Fetch all special event attendance (for analytics)
    const { data, error } = await supabase
      .from('special_event_attendance')
      .select(`
        *,
        special_events (
          id,
          title,
          event_type,
          date
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ attendance: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// POST: Bulk save attendance for a special event (Admin only)
// Replaces all existing records for the event with the new set
export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { eventId, records } = body;

    // records: [{ name, division, status, notes? }]
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: 'records must be a non-empty array.' },
        { status: 400 }
      );
    }

    const validStatuses = ['Hadir', 'Alfa', 'Izin', 'Sakit'];
    const invalid = records.find((r: any) => !r.name || !r.division || !validStatuses.includes(r.status));
    if (invalid) {
      return NextResponse.json(
        { error: 'Each record must have name, division, and status (Hadir/Alfa/Izin/Sakit).' },
        { status: 400 }
      );
    }

    // Upsert: update if (event_id, name) exists, else insert
    const toUpsert = records.map((r: any) => ({
      event_id: eventId,
      name: r.name.trim(),
      division: r.division,
      status: r.status,
      notes: r.notes?.trim() || null,
    }));

    const { data, error } = await supabase
      .from('special_event_attendance')
      .upsert(toUpsert, { onConflict: 'event_id,name' })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `${data?.length || toUpsert.length} attendance records saved.`,
      count: data?.length || toUpsert.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// PATCH: Update a single attendance record (Admin only)
export async function PATCH(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Attendance record ID is required.' }, { status: 400 });
    }

    const validStatuses = ['Hadir', 'Alfa', 'Izin', 'Sakit'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Status must be one of: Hadir, Alfa, Izin, Sakit.' },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const { data, error } = await supabase
      .from('special_event_attendance')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, record: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// DELETE: Remove attendance record(s) for an event (Admin only)
export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');         // single record
    const eventId = searchParams.get('eventId'); // all records for event

    if (id) {
      const { error } = await supabase
        .from('special_event_attendance')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'Record deleted.' });
    }

    if (eventId) {
      const { error } = await supabase
        .from('special_event_attendance')
        .delete()
        .eq('event_id', eventId);

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'All attendance for event deleted.' });
    }

    return NextResponse.json({ error: 'id or eventId is required.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
