import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { withRateLimit, getClientIdentifier } from '@/lib/rate-limit';

// GET — Fetch all face profiles (for face matching on client) or specific profile for management
export async function GET(request: Request) {
  // Apply lighter rate limiting for profile fetches (needed for face recognition)
  const limited = await withRateLimit(request, '/api/face-profiles');
  if (limited) {
    return limited;
  }

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (name) {
      // Fetch specific profile with full data (for management)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name, division, face_descriptor')
        .ilike('name', name.trim())
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

      // Return raw data (includes thumbnails)
      return NextResponse.json({ profile: data[0] });
    }

    // Default: Fetch all profiles for face recognition (standardized to number[][])
    const { data: allData, error: allDocsError } = await supabase
      .from('user_profiles')
      .select('id, name, division, face_descriptor')
      .not('face_descriptor', 'is', null);

    if (allDocsError) throw allDocsError;

    const standardizedProfiles = (allData || []).map(p => {
      let raw = p.face_descriptor;
      let descriptors: number[][] = [];

      if (Array.isArray(raw)) {
        if (typeof raw[0] === 'number') {
          descriptors = [raw as number[]];
        } else if (Array.isArray(raw[0])) {
          descriptors = raw as number[][];
        } else if (typeof raw[0] === 'object' && raw[0].descriptor) {
          descriptors = raw.map((item: any) => item.descriptor);
        }
      }

      return { ...p, face_descriptor: descriptors };
    });

    return NextResponse.json({ profiles: standardizedProfiles });
  } catch (error: any) {
    console.error('[FaceProfiles] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles: ' + error.message }, { status: 500 });
  }
}

// POST — Register, update, or delete samples
export async function POST(request: Request) {
  // Apply rate limiting
  const limited = await withRateLimit(request, '/api/face-profiles');
  if (limited) {
    return limited;
  }

  try {
    const body = await request.json();
    const { name, division, faceDescriptor, action, sampleIndex, thumbnail, thumbnails } = body;

    // Handle DELETE SAMPLE action
    if (action === 'delete_sample' && name && typeof sampleIndex === 'number') {
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id, face_descriptor')
        .ilike('name', name.trim())
        .limit(1);

      if (!existing || existing.length === 0) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }

      let current = existing[0].face_descriptor;
      if (!Array.isArray(current)) return NextResponse.json({ error: 'No samples found.' }, { status: 400 });

      // Support all formats during deletion
      const newDescriptors = current.filter((_, i) => i !== sampleIndex);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ face_descriptor: newDescriptors })
        .eq('id', existing[0].id);

      if (updateError) throw updateError;
      return NextResponse.json({ success: true, message: 'Sample deleted successfully.' });
    }

    if (!name || !division || !faceDescriptor) {
      return NextResponse.json(
        { error: 'Name, division, and face descriptor are required.' },
        { status: 400 }
      );
    }

    // Validate face descriptor format
    const isSingle = Array.isArray(faceDescriptor) && typeof faceDescriptor[0] === 'number' && faceDescriptor.length === 128;
    const isMultiple = Array.isArray(faceDescriptor) && Array.isArray(faceDescriptor[0]) && faceDescriptor[0].length === 128;

    if (!isSingle && !isMultiple) {
      return NextResponse.json({ error: 'Invalid face descriptor format.' }, { status: 400 });
    }

    const incomingDescriptors = isSingle ? [faceDescriptor] : faceDescriptor;
    const incomingThumbnails = thumbnails || (thumbnail ? [thumbnail] : []);

    // 1. BIOMETRIC DUPLICATE CHECK
    const { data: allProfiles } = await supabase
      .from('user_profiles')
      .select('name, division, face_descriptor')
      .not('face_descriptor', 'is', null);

    if (allProfiles && allProfiles.length > 0) {
      const threshold = 0.40;
      const duplicate = allProfiles.find(p => {
        if (p.name.toLowerCase() === name.trim().toLowerCase()) return false;
        
        let dbRaw = p.face_descriptor;
        let dbDescriptors: number[][] = [];
        if (Array.isArray(dbRaw)) {
          if (typeof dbRaw[0] === 'number') dbDescriptors = [dbRaw as number[]];
          else if (Array.isArray(dbRaw[0])) dbDescriptors = dbRaw as number[][];
          else if (typeof dbRaw[0] === 'object') dbDescriptors = dbRaw.map((i: any) => i.descriptor);
        }

        return incomingDescriptors.some((incDesc: number[]) => {
          return dbDescriptors.some(dbDesc => {
            const dist = Math.sqrt(dbDesc.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - incDesc[i], 2), 0));
            return dist < threshold;
          });
        });
      });

      if (duplicate) {
        return NextResponse.json({ 
          error: `WAJAH SUDAH TERDAFTAR: Milik "${duplicate.name}" (${duplicate.division}).`,
          isDuplicate: true,
          name: duplicate.name,
          division: duplicate.division
        }, { status: 400 });
      }
    }

    // 2. Insert or Update
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id, face_descriptor')
      .ilike('name', name.trim())
      .limit(1);

    // Prepare new data entries: { descriptor, thumbnail }
    const newDataEntries = incomingDescriptors.map((desc: number[], i: number) => ({
      descriptor: desc,
      thumbnail: incomingThumbnails[i] || null
    }));

    if (existing && existing.length > 0) {
      let finalData = newDataEntries;

      if (action === 'append') {
        let currentRaw = existing[0].face_descriptor;
        let currentEntries: any[] = [];

        if (Array.isArray(currentRaw)) {
          if (typeof currentRaw[0] === 'number') {
            currentEntries = [{ descriptor: currentRaw, thumbnail: null }];
          } else if (Array.isArray(currentRaw[0])) {
            currentEntries = currentRaw.map(d => ({ descriptor: d, thumbnail: null }));
          } else {
            currentEntries = currentRaw;
          }
        }

        finalData = [...currentEntries, ...newDataEntries];
        if (finalData.length > 20) finalData = finalData.slice(-20);
      }

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ division, face_descriptor: finalData })
        .eq('id', existing[0].id);

      if (updateError) throw updateError;
      return NextResponse.json({ success: true, message: 'Face profile updated.', updated: true });
    } else {
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert([{ name: name.trim(), division, face_descriptor: newDataEntries }]);

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, message: 'Face profile registered.', updated: false });
    }
  } catch (error: any) {
    console.error('[FaceProfiles] POST error:', error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}

// DELETE — Remove a face profile
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Profile deleted.' });
  } catch (error: any) {
    console.error('[FaceProfiles] DELETE error:', error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
