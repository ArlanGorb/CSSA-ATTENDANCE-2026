import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, set } from 'date-fns';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { meetingId, token, name, division, deviceId, photo } = body;

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
    if (new Date() > new Date(meeting.qr_expiry)) {
      return NextResponse.json({ error: 'QR Code expired. Refresh and scan again.' }, { status: 400 });
    }

    // 2. Check if user already attended (case-insensitive)
    const { data: existing, error: existingError } = await supabase
      .from('attendance')
      .select('id')
      .eq('meeting_id', meetingId)
      .ilike('name', name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'You have already submitted attendance.' }, { status: 400 });
    }

    // 3. Calculate Attendance Status (Hadir vs Late)
    const now = new Date(); // Server time (UTC usually)

    const [hours, minutes] = meeting.start_time.split(':');
    const meetingDate = parseISO(meeting.date);
    const meetingStartDateTime = set(meetingDate, {
        hours: parseInt(hours),
        minutes: parseInt(minutes),
        seconds: 0
    });

    // Adjust for timezone offset (WIB = UTC+7)
    const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const diffMinutes = differenceInMinutes(nowWIB, meetingStartDateTime);
    
    let status = 'Hadir';
    if (diffMinutes > meeting.attendance_limit_minutes) {
      status = 'Late';
    }

    // Check device ID for duplicates in the same meeting
    let is_suspicious = false;
    if (deviceId) {
       const { data: deviceCheck } = await supabase
         .from('attendance')
         .select('id')
         .eq('meeting_id', meetingId)
         .eq('device_id', deviceId)
         .limit(1);
         
       if (deviceCheck && deviceCheck.length > 0) {
         is_suspicious = true;
         // Log into security_logs table
         await supabase.from('security_logs').insert([{
            meeting_id: meetingId,
            name: name,
            division: division,
            device_id: deviceId,
            threat_level: 'HIGH',
            threat_type: 'DEVICE_SPOOFING'
         }]);

         return NextResponse.json({ error: 'SECURITY BREACH: This device has already submitted attendance.' }, { status: 403 });
       }
    }

    // 4. Upload photo if provided
    let photo_url: string | null = null;
    if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
      try {
        const base64Data = photo.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${meetingId}/${name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('attendance-photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('attendance-photos')
            .getPublicUrl(fileName);
          photo_url = urlData?.publicUrl || null;
        }
      } catch (photoErr: any) {
        console.warn('[Photo] Error:', photoErr.message);
      }
    }

    // 5. Insert Record
    const insertData: Record<string, any> = {
      meeting_id: meetingId,
      name,
      division,
      status,
      device_id: deviceId,
      is_suspicious,
    };
    if (photo_url) insertData.photo_url = photo_url;

    const { error: insertError } = await supabase.from('attendance').insert([insertData]);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
