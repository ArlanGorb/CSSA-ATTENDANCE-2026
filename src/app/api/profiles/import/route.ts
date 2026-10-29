import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { withRateLimit } from '@/lib/rate-limit';
import { verifyAdminToken } from '@/lib/admin-auth';

export async function POST(request: Request) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized. Admin token required.' }, { status: 401 });
  }

  const limited = await withRateLimit(request, '/api/profiles/import');
  if (limited) return limited;

  try {
    const body = await request.json();
    const { students } = body;

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { error: 'Invalid data format. Expected an array of students.' },
        { status: 400 }
      );
    }

    // Map, validate, and normalize incoming rows.
    const normalized = students
      .map((student: any) => ({
        name: student.name ? String(student.name).trim() : '',
        major: student.major ? String(student.major).trim() : null,
        division: student.divisi ? String(student.divisi).trim() : 'Unknown',
        tanggal_lahir: student.tanggal_lahir ? String(student.tanggal_lahir) : null,
        attendance_status: String(student.attendance_status || student.status || '').trim().toLowerCase() === 'magang'
          ? 'Magang'
          : 'Aktif'
      }))
      .filter((student) => Boolean(student.name));

    if (normalized.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows found. Please ensure each row has at least a name.' },
        { status: 400 }
      );
    }

    // Avoid PostgreSQL 21000 error by deduplicating conflicting rows inside the same batch.
    const dedupedMap = new Map<string, (typeof normalized)[number]>();
    for (const row of normalized) {
      const key = row.name.toLowerCase();
      dedupedMap.set(key, row);
    }

    const recordsToInsert = Array.from(dedupedMap.values());
    const duplicateCount = normalized.length - recordsToInsert.length;
    
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(recordsToInsert, { onConflict: 'name' })
      .select();

    if (error) {
      console.error("Bulk insert error:", error);
      return NextResponse.json({ error: 'Failed to import records: ' + error.message }, { status: 500 });
    }

    const importedCount = data?.length || recordsToInsert.length;

    return NextResponse.json({ 
      success: true, 
      message: duplicateCount > 0
        ? `${importedCount} students imported successfully. ${duplicateCount} duplicate name rows in Excel were merged automatically.`
        : `${importedCount} students imported successfully.`,
      importedCount,
      duplicateCount
    });

  } catch (error: any) {
    console.error("Import API Error:", error);
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
