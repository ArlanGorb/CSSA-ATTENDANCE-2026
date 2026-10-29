import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { withRateLimit } from '@/lib/rate-limit';
import { verifyAdminToken } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const limited = await withRateLimit(request, '/api/profiles');
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const noreg = searchParams.get('noreg');

    if (noreg) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, division, noreg, attendance_status')
        .eq('noreg', noreg.trim())
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ profile: data[0] });
    }

    const { data: allData, error: allDocsError } = await supabase
      .from('user_profiles')
      .select('id, name, division, major, tanggal_lahir, noreg, attendance_status');

    if (allDocsError) throw allDocsError;
    return NextResponse.json({ profiles: allData });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch profiles: ' + error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = await withRateLimit(request, '/api/profiles');
  if (limited) return limited;

  try {
    const body = await request.json();
    const { name, division, noreg } = body;

    if (!name || !division || !noreg) {
      return NextResponse.json(
        { error: 'Name, division, and noreg are required.' },
        { status: 400 }
      );
    }

    // Check for duplicate noreg
    const { data: duplicateNoreg } = await supabase
      .from('user_profiles')
      .select('id, name, division')
      .eq('noreg', noreg.trim())
      .limit(1);

    if (duplicateNoreg && duplicateNoreg.length > 0) {
      return NextResponse.json({ 
        error: `NOREG SUDAH TERDAFTAR atas nama "${duplicateNoreg[0].name}" (${duplicateNoreg[0].division}).`,
        isDuplicate: true,
        name: duplicateNoreg[0].name,
        division: duplicateNoreg[0].division
      }, { status: 400 });
    }

    // Insert new profile
    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert([{ name: name.trim(), division, noreg: noreg.trim() }]);

    if (insertError) throw insertError;
    return NextResponse.json({ success: true, message: 'Profile registered successfully.' });

  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const { id, attendanceStatus } = await request.json();

    if (!id || !['Aktif', 'Magang'].includes(attendanceStatus)) {
      return NextResponse.json(
        { error: 'ID profil dan status Aktif atau Magang wajib diisi.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ attendance_status: attendanceStatus })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, attendanceStatus });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteAll = searchParams.get('all') === 'true';

    if (deleteAll) {
      // Supabase requires at least one filter for delete operations
      const { error } = await supabase.from('user_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      return NextResponse.json({ success: true, message: 'All profiles deleted.' });
    }

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required.' }, { status: 400 });
    }

    const { error } = await supabase.from('user_profiles').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'Profile deleted.' });
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
