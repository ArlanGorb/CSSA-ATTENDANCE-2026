import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, set, format } from 'date-fns';
import { withRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { sendAttendanceEmail } from '@/lib/email';

export async function POST(request: Request) {
  // Apply rate limiting
  const identifier = getClientIdentifier(request);
  const limited = await withRateLimit(request, '/api/attendance');
  if (limited) {
    return limited;
  }

  try {
    const body = await request.json();
    const { meetingId, token, name, division, deviceId, photo, manual, email } = body;

    // 1. Verify Meeting & Token
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Skip token validation for manual attendance
    if (!manual) {
      // Check token validity
      if (meeting.qr_token !== token) {
        return NextResponse.json({ error: 'Invalid QR Token. Please rescan.' }, { status: 400 });
      }

      // SERVER-SIDE: Check token expiry with timezone awareness
      const now = new Date();
      const expiryDate = new Date(meeting.qr_expiry);

      // Add 7 hours for WIB timezone if expiry is stored in UTC
      const expiryWIB = new Date(expiryDate.getTime() + (7 * 60 * 60 * 1000));

      if (now > expiryWIB) {
        // Auto-refresh token if expired
        const newToken = crypto.randomUUID();
        const newExpiry = new Date(Date.now() + (5 * 60 * 1000)); // 5 minutes

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
    const serverTime = new Date(); // Server time (UTC usually)

    const [hours, minutes] = meeting.start_time.split(':');
    const meetingDate = parseISO(meeting.date);
    const meetingStartDateTime = set(meetingDate, {
        hours: parseInt(hours),
        minutes: parseInt(minutes),
        seconds: 0
    });

    // Adjust for timezone offset (WIB = UTC+7)
    const nowWIB = new Date(serverTime.getTime() + (7 * 60 * 60 * 1000));
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

    if (!photo && !manual) {
      console.warn(`[Photo] Warning: No photo data received for ${name}`);
    }

    if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
      try {
        const base64Data = photo.split(',')[1];
        if (!base64Data || base64Data.length < 100) {
          throw new Error('Invalid base64 image data');
        }

        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${meetingId}/${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.jpg`;

        console.log(`[Photo] Attempting upload: ${fileName} (${buffer.length} bytes)`);

        const { error: uploadError } = await supabase.storage
          .from('attendance-photos')
          .upload(fileName, buffer, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          console.error('[Photo] Upload Error:', uploadError.message, uploadError);
          // Don't fail the whole attendance if upload fails, but log it
        } else {
          const { data: urlData } = supabase.storage
            .from('attendance-photos')
            .getPublicUrl(fileName);
          photo_url = urlData?.publicUrl || null;
          console.log('[Photo] Upload Success:', photo_url);
        }
      } catch (photoErr: any) {
        console.error('[Photo] Processing Error:', photoErr.message);
      }
    }

    // 5. Insert Record
    const insertData: Record<string, any> = {
      meeting_id: meetingId,
      name,
      division,
      status,
      device_id: manual ? 'manual-submission' : deviceId,
      is_suspicious,
      photo_url: photo_url,
      created_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase.from('attendance').insert([insertData]);
    if (insertError) throw insertError;

    // 6. Send email notification (async, non-blocking)
    if (email && process.env.SMTP_HOST) {
      try {
        const meetingDateFormatted = format(new Date(meeting.date), 'dd MMMM yyyy');
        
        await sendAttendanceEmail(email, {
          name,
          meetingTitle: meeting.title,
          meetingDate: meetingDateFormatted,
          status: status as 'Hadir' | 'Late',
          timestamp: format(new Date(), 'HH:mm:ss')
        });
      } catch (emailError) {
        console.error('[Email] Failed to send:', emailError);
        // Don't fail the attendance if email fails
      }
    }

    return NextResponse.json({ success: true, status, emailSent: !!email });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
