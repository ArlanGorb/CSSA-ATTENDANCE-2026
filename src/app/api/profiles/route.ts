import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { withRateLimit } from '@/lib/rate-limit';

function verifyAdminToken(request: Request): boolean {
  const adminToken = request.headers.get('x-admin-token');
  const serverPassword = process.env.ADMIN_PASSWORD || '8182838485';
  return adminToken === serverPassword;
}

export async function GET(request: Request) {
  const limited = await withRateLimit(request, '/api/profiles');
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const noreg = searchParams.get('noreg');

    if (noreg) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, division, noreg')
        .eq('noreg', noreg.trim())
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      return NextResponse.json({ profile: data[0] });
    }

    const { data: allData, error: allDocsError } = await supabase
      .from('user_profiles')
      .select('id, name, division, noreg')
      .not('noreg', 'is', null);

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

export async function DELETE(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

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
