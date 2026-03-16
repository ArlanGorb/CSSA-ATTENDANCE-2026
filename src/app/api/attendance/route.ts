import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, set } from 'date-fns';

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { meetingId, token, name, division, deviceId, photo, userLat, userLng } = body;

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

    // 1.5. Verify GPS (Server-side)
    if (meeting.latitude && meeting.longitude) {
      if (!userLat || !userLng) {
        return NextResponse.json({ error: 'Location access is required for this meeting.' }, { status: 400 });
      }

      const distance = getDistance(userLat, userLng, meeting.latitude, meeting.longitude);
      if (distance > (meeting.radius_meters || 100)) {
        // Log GPS Spoofing attempt
        await supabase.from('security_logs').insert([{
           meeting_id: meetingId,
           name: name,
           division: division,
           device_id: deviceId,
           threat_level: 'HIGH',
           threat_type: 'GPS_SPOOFING'
        }]);
        return NextResponse.json({ error: `SECURITY ALERT: You are outside the allowed area (${Math.round(distance)}m away).` }, { status: 403 });
      }
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

    // Construct Meeting Start Date
    // Note: This relies on the server and meeting creator being in sync or using ISO strings.
    // Ideally, store `start_datetime` as TIMESTAMPTZ.
    // For now, we combine date and time strings.
    const [hours, minutes] = meeting.start_time.split(':');
    
    // We assume the meeting date is in the same timezone as the server or just use the local date parts.
    // To be safe regarding timezones, let's treat everything as UTC for calculation or just offset based.
    // A robust way: The admin entered local time. 
    // We should probably convert `now` to that local time or vice versa.
    // But let's stick to a simpler approximation:
    const meetingDate = parseISO(meeting.date);
    const meetingStartDateTime = set(meetingDate, {
        hours: parseInt(hours),
        minutes: parseInt(minutes),
        seconds: 0
    });

    // If the meeting was created today, the date parts should match.
    // differenceInMinutes returns (dateLeft - dateRight).
    // If now > start + limit, then Late.
    
    // Adjust for timezone offset if deployed on Vercel (UTC) and used in WIB (UTC+7).
    // Vercel server time is UTC.
    // Start Time provided by user is likely WIB (e.g. 14:00).
    // If we create meetingStartDateTime as UTC 14:00, and now is UTC 07:00 (which is 14:00 WIB),
    // Then checking (now - meeting) would be (07:00 - 14:00) = -7 hours.
    // FIX: Parse input as if it's in the server's timezone, OR shift both to numbers.
    // Better strategy: Compare purely based on minutes relative to start.
    
    // Let's assume the user inputs time in local time (WIB).
    // And `now` is UTC.
    // We need to shift `now` to WIB (UTC+7) to match the "face value" of the input.
    const nowWIB = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    const diffMinutes = differenceInMinutes(nowWIB, meetingStartDateTime);
    
    let status = 'Hadir';
    console.log(`Meeting: ${meetingStartDateTime}, NowWIB: ${nowWIB}, Diff: ${diffMinutes}`);

    if (diffMinutes > meeting.attendance_limit_minutes) {
      status = 'Late';
    } else if (diffMinutes < -60) {
        // Trying to attend way too early? (e.g. 1 hour before)
        // Usually fine, but maybe 'Hadir'.
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
         console.warn(`Suspicious: Multiple attendance from same device (${deviceId}) for meeting ${meetingId}`);
         
         // Log into security_logs table for Admin Intrusion Dashboard
         await supabase.from('security_logs').insert([{
            meeting_id: meetingId,
            name: name,
            division: division,
            device_id: deviceId,
            threat_level: 'HIGH',
            threat_type: 'DEVICE_SPOOFING'
         }]);

         // Block multiple submissions from one device
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
        } else {
          console.warn('[Photo] Upload failed:', uploadError.message);
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

