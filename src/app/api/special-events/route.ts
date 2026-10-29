import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyAdminToken } from '@/lib/admin-auth';

// GET: Fetch all special events (optionally filter by type or archived status)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const archived = searchParams.get('archived') === 'true';
    const id = searchParams.get('id');

    // Single event by id
    if (id) {
      const { data, error } = await supabase
        .from('special_events')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      return NextResponse.json({ event: data });
    }

    let query = supabase
      .from('special_events')
      .select('*')
      .order('date', { ascending: false });

    if (type) {
      query = query.eq('event_type', type);
    }

    if (archived) {
      query = query.eq('is_archived', true);
    } else {
      query = query.or('is_archived.eq.false,is_archived.is.null');
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ events: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// POST: Create a new special event (Admin only)
export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, event_type, date, description } = body;

    if (!title || !event_type || !date) {
      return NextResponse.json(
        { error: 'Title, event_type, and date are required.' },
        { status: 400 }
      );
    }

    const validTypes = ['Study Bible', 'Doa Subuh', 'Lainnya'];
    if (!validTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('special_events')
      .insert([{
        title: title.trim(),
        event_type,
        date,
        description: description?.trim() || null,
        is_archived: false,
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, event: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// PATCH: Update a special event (title, description, archive) (Admin only)
export async function PATCH(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, description, is_archived } = body;

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (is_archived !== undefined) updates.is_archived = is_archived;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('special_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, event: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// DELETE: Delete a special event (Admin only)
export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('special_events')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Event deleted.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
