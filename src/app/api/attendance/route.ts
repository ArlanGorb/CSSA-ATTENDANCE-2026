import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, set, format } from 'date-fns';
import { withRateLimit } from '@/lib/rate-limit';
import { verifyAdminToken } from '@/lib/admin-auth';

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
      .select('name, division, attendance_status')
      .eq('noreg', noreg.trim())
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ error: `Noreg ${noreg} belum terdaftar di sistem.` }, { status: 404 });
    }

    const { name, division } = userProfile;

    if (userProfile.attendance_status === 'Magang') {
      return NextResponse.json(
        { error: `${name} sedang berstatus Magang dan tidak perlu mengambil absensi.`, exempt: true, name, division },
        { status: 409 }
      );
    }

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
    const { meetingId, action } = body;

    if (!meetingId) {
      return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 });
    }

    // 1. Get all registered students
    const { data: allStudents, error: studentsError } = await supabase
      .from('user_profiles')
      .select('name, division, attendance_status');

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

    // 3. Find missing students
    const missingStudents = allStudents.filter(
      (s: any) =>
        s.attendance_status !== 'Magang' &&
        !attendedNames.has(s.name.toLowerCase().trim())
    );

    if (missingStudents.length === 0) {
      return NextResponse.json({ message: 'Tidak ada mahasiswa aktif yang perlu ditandai.', marked: 0 });
    }

    const isAutoHadir = action === 'auto-hadir';
    const statusToMark = isAutoHadir ? 'Hadir' : 'Alfa';
    const deviceId = isAutoHadir ? 'auto-hadir' : 'auto-alfa';

    // 4. Insert records for missing students
    const records = missingStudents.map((s: any) => ({
      meeting_id: meetingId,
      name: s.name,
      division: s.division,
      status: statusToMark,
      device_id: deviceId,
      is_suspicious: false,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase.from('attendance').insert(records);
    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: `${missingStudents.length} mahasiswa ditandai ${statusToMark}.`,
      marked: missingStudents.length,
      names: missingStudents.map((s: any) => s.name)
    });
  } catch (error: any) {
    console.error('[MarkAlfa] Error:', error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
