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

    // Standardize: ensure face_descriptor returned to client logic is always an array of arrays
    const standardizedProfiles = (data || []).map(p => {
      let descriptors = p.face_descriptor;
      if (descriptors && Array.isArray(descriptors) && typeof descriptors[0] === 'number') {
        descriptors = [descriptors]; // Wrap single legacy descriptor
      }
      return { ...p, face_descriptor: descriptors };
    });

    return NextResponse.json({ profiles: standardizedProfiles });
  } catch (error: any) {
    console.error('[FaceProfiles] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles: ' + error.message }, { status: 500 });
  }
}

// POST — Register or update a face profile
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, division, faceDescriptor, action } = body;

    if (!name || !division || !faceDescriptor) {
      return NextResponse.json(
        { error: 'Name, division, and face descriptor are required.' },
        { status: 400 }
      );
    }

    // Validate face descriptor format - can be 128-float array or multiple
    const isSingle = Array.isArray(faceDescriptor) && typeof faceDescriptor[0] === 'number' && faceDescriptor.length === 128;
    const isMultiple = Array.isArray(faceDescriptor) && Array.isArray(faceDescriptor[0]) && faceDescriptor[0].length === 128;

    if (!isSingle && !isMultiple) {
      return NextResponse.json(
        { error: 'Invalid face descriptor format. Expected 128-float array or array of arrays.' },
        { status: 400 }
      );
    }

    const incomingDescriptors = isSingle ? [faceDescriptor] : faceDescriptor;

    // 1. BIOMETRIC DUPLICATE CHECK (Server-side)
    // Fetch all existing profiles to compare descriptors
    const { data: allProfiles } = await supabase
      .from('user_profiles')
      .select('name, division, face_descriptor')
      .not('face_descriptor', 'is', null);

    if (allProfiles && allProfiles.length > 0) {
      const threshold = 0.40; // Strict threshold for duplicate detection
      
      const duplicate = allProfiles.find(p => {
        // Skip if it's the same name (updating their own profile)
        if (p.name.toLowerCase() === name.trim().toLowerCase()) return false;
        
        // Handle both single and multiple descriptors in DB
        let dbDescriptors = p.face_descriptor;
        if (typeof dbDescriptors[0] === 'number') dbDescriptors = [dbDescriptors];

        // Check against ANY of the incoming descriptors against ANY of the stored ones
        return incomingDescriptors.some((incDesc: number[]) => {
          return (dbDescriptors as number[][]).some(dbDesc => {
            const dist = Math.sqrt(
              dbDesc.reduce((sum: number, val: number, i: number) => 
                sum + Math.pow(val - incDesc[i], 2), 0)
            );
            return dist < threshold;
          });
        });
      });

      if (duplicate) {
        return NextResponse.json({ 
          error: `WAJAH SUDAH TERDAFTAR: Wajah ini terdeteksi milik "${duplicate.name}" (${duplicate.division}).`,
          isDuplicate: true,
          name: duplicate.name,
          division: duplicate.division
        }, { status: 400 });
      }
    }

    // 2. Check if user already exists (by name) to decide update vs insert

    // Check if user already exists
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id, face_descriptor')
      .ilike('name', name.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      let finalDescriptors = incomingDescriptors;

      if (action === 'append') {
        // Legacy support: if existing is a single flat array
        let currentDescriptors = existing[0].face_descriptor;
        if (currentDescriptors && typeof currentDescriptors[0] === 'number') {
          currentDescriptors = [currentDescriptors];
        } else if (!currentDescriptors) {
          currentDescriptors = [];
        }

        // Avoid exact duplicates in the set
        finalDescriptors = [...(currentDescriptors as number[][]), ...incomingDescriptors];
        
        // Limit total samples to 20 for performance/storage
        if (finalDescriptors.length > 20) {
          finalDescriptors = finalDescriptors.slice(-20);
        }
      }

      // Update existing profile
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          division,
          face_descriptor: finalDescriptors,
        })
        .eq('id', existing[0].id);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: action === 'append' ? 'Face profile samples added.' : 'Face profile updated successfully.',
        updated: true,
      });
    } else {
      // Insert new profile
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert([{
          name: name.trim(),
          division,
          face_descriptor: incomingDescriptors,
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
