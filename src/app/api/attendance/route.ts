import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, set, format } from 'date-fns';
import { withRateLimit } from '@/lib/rate-limit';

function verifyAdminToken(request: Request): boolean {
  const adminToken = request.headers.get('x-admin-token');
  const serverPassword = process.env.ADMIN_PASSWORD || '8182838485';
  return adminToken === serverPassword;
}

export async function POST(request: Request) {
  const limited = await withRateLimit(request, '/api/attendance');
  if (limited) return limited;

  try {
    const body = await request.json();
    const { meetingId, token, noreg } = body;

    if (!meetingId || !noreg) {
      return NextResponse.json({ error: 'meetingId and noreg are required.' }, { status: 400 });
    }

    // 1. Verify Meeting & Token
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Check token validity
    if (meeting.qr_token !== token) {
      return NextResponse.json({ error: 'Invalid QR Token. Please rescan.' }, { status: 400 });
    }

    // Check token expiry
    const now = new Date();
    const expiryDate = new Date(meeting.qr_expiry);
    const expiryWIB = new Date(expiryDate.getTime() + (7 * 60 * 60 * 1000));

    if (now > expiryWIB) {
      const newToken = crypto.randomUUID();
      const newExpiry = new Date(Date.now() + (5 * 60 * 1000));
      await supabase.from('meetings').update({
        qr_token: newToken,
        qr_expiry: newExpiry.toISOString()
      }).eq('id', meetingId);

      return NextResponse.json({
        error: 'QR Code expired. Please refresh and scan again.',
        expired: true,
        newToken
      }, { status: 400 });
    }

    // 2. Fetch User by NOREG
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('name, division')
      .eq('noreg', noreg.trim())
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: `Noreg ${noreg} belum terdaftar di sistem.` }, { status: 404 });
    }

    const { name, division } = userProfile;

    // 3. Check if user already attended
    const { data: existing, error: existingError } = await supabase
      .from('attendance')
      .select('id')
      .eq('meeting_id', meetingId)
      .ilike('name', name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `Mahasiswa atas nama ${name} sudah absen.` }, { status: 400 });
    }

    // 4. Calculate Attendance Status (Hadir vs Late)
    const serverTime = new Date();
    const [hours, minutes] = meeting.start_time.split(':');
    const meetingDate = parseISO(meeting.date);
    const meetingStartDateTime = set(meetingDate, {
        hours: parseInt(hours),
        minutes: parseInt(minutes),
        seconds: 0
    });

    const nowWIB = new Date(serverTime.getTime() + (7 * 60 * 60 * 1000));
    const diffMinutes = differenceInMinutes(nowWIB, meetingStartDateTime);

    let status = 'Hadir';
    if (diffMinutes > meeting.attendance_limit_minutes) {
      status = 'Late';
    }

    // 5. Insert Record
    const insertData = {
      meeting_id: meetingId,
      name,
      division,
      status,
      device_id: 'barcode-scanner', // Fallback for schema constraints
      is_suspicious: false,
      created_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase.from('attendance').insert([insertData]);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, status, name, division });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// ─── PUT: Mark Alfa (Admin Only) ───
export async function PUT(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { meetingId } = body;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    // 1. Get all registered students
    const { data: allStudents, error: studentsError } = await supabase
      .from('user_profiles')
      .select('name, division');

    if (studentsError) throw studentsError;
    if (!allStudents || allStudents.length === 0) {
      return NextResponse.json({ error: 'No registered students found.' }, { status: 400 });
    }

    // 2. Get existing attendance for this meeting
    const { data: existingAttendance, error: attError } = await supabase
      .from('attendance')
      .select('name')
      .eq('meeting_id', meetingId);

    if (attError) throw attError;

    const attendedNames = new Set(
      (existingAttendance || []).map((a: any) => a.name.toLowerCase().trim())
    );

    // 3. Find absent students
    const absentStudents = allStudents.filter(
      (s: any) => !attendedNames.has(s.name.toLowerCase().trim())
    );

    if (absentStudents.length === 0) {
      return NextResponse.json({ message: 'Semua mahasiswa sudah terabsen.', marked: 0 });
    }

    // 4. Insert "Alfa" records for absent students
    const alfaRecords = absentStudents.map((s: any) => ({
      meeting_id: meetingId,
      name: s.name,
      division: s.division,
      status: 'Alfa',
      device_id: 'auto-alfa',
      is_suspicious: false,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase.from('attendance').insert(alfaRecords);
    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: `${absentStudents.length} mahasiswa ditandai Alfa.`,
      marked: absentStudents.length,
      names: absentStudents.map((s: any) => s.name)
    });
  } catch (error: any) {
    console.error('[MarkAlfa] Error:', error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
