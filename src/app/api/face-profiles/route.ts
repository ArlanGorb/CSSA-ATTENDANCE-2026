import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET — Fetch all face profiles (for face matching on client)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, name, division, face_descriptor')
      .not('face_descriptor', 'is', null);

    if (error) throw error;

    return NextResponse.json({ profiles: data || [] });
  } catch (error: any) {
    console.error('[FaceProfiles] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles: ' + error.message }, { status: 500 });
  }
}

// POST — Register or update a face profile
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, division, faceDescriptor } = body;

    if (!name || !division || !faceDescriptor) {
      return NextResponse.json(
        { error: 'Name, division, and face descriptor are required.' },
        { status: 400 }
      );
    }

    // Validate face descriptor format
    if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return NextResponse.json(
        { error: 'Invalid face descriptor format.' },
        { status: 400 }
      );
    }

    // 1. BIOMETRIC DUPLICATE CHECK (Server-side)
    // Fetch all existing profiles to compare descriptors
    const { data: allProfiles } = await supabase
      .from('user_profiles')
      .select('name, division, face_descriptor')
      .not('face_descriptor', 'is', null);

    if (allProfiles && allProfiles.length > 0) {
      const threshold = 0.5; // Strict threshold for duplicate detection
      
      const duplicate = allProfiles.find(p => {
        // Skip if it's the same name (updating their own profile)
        if (p.name.toLowerCase() === name.trim().toLowerCase()) return false;
        
        // Calculate Euclidean Distance
        const dist = Math.sqrt(
          p.face_descriptor.reduce((sum: number, val: number, i: number) => 
            sum + Math.pow(val - faceDescriptor[i], 2), 0)
        );
        
        return dist < threshold;
      });

      if (duplicate) {
        return NextResponse.json({ 
          error: `WAJAH SUDAH TERDAFTAR: Wajah ini terdeteksi milik "${duplicate.name}" (${duplicate.division}). Satu orang hanya boleh memiliki satu profil.`,
          isDuplicate: true
        }, { status: 400 });
      }
    }

    // 2. Check if user already exists (by name) to decide update vs insert

    // Check if user already exists
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .ilike('name', name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          division,
          face_descriptor: faceDescriptor,
        })
        .eq('id', existing[0].id);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: 'Face profile updated successfully.',
        updated: true,
      });
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert([{
          name: name.trim(),
          division,
          face_descriptor: faceDescriptor,
        }]);

      if (insertError) throw insertError;

      return NextResponse.json({
        success: true,
        message: 'Face profile registered successfully.',
        updated: false,
      });
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
