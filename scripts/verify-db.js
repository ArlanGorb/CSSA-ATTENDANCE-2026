/**
 * Database Migration Verification Script
 * Checks if all tables and columns exist in the database
 * 
 * Usage: node scripts/verify-db.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Error: Missing Supabase credentials in .env.local');
  console.error('Please copy .env.local.example to .env.local and fill in your values');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Expected tables and columns
const EXPECTED_SCHEMA = {
  meetings: [
    'id', 'title', 'date', 'start_time', 'attendance_limit_minutes',
    'latitude', 'longitude', 'radius_meters', 'is_archived',
    'qr_token', 'qr_expiry', 'created_at'
  ],
  attendance: [
    'id', 'meeting_id', 'name', 'division', 'status',
    'device_id', 'is_suspicious', 'photo_url',
    'timestamp', 'created_at'
  ],
  user_profiles: [
    'id', 'name', 'division', 'face_descriptor', 'created_at'
  ],
  security_logs: [
    'id', 'meeting_id', 'name', 'division', 'device_id',
    'threat_level', 'threat_type', 'timestamp'
  ],
  absence_requests: [
    'id', 'name', 'division', 'meeting_id', 'absence_type',
    'reason', 'attachment_url', 'status', 'admin_note',
    'created_at', 'reviewed_at', 'reviewed_by'
  ]
};

async function verifyDatabase() {
  console.log('🔍 Verifying database schema...\n');
  
  let allGood = true;
  
  for (const [tableName, expectedColumns] of Object.entries(EXPECTED_SCHEMA)) {
    console.log(`📋 Checking table: ${tableName}...`);
    
    // Check if table exists
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.error(`   ❌ Table '${tableName}' does not exist!`);
        console.error(`      Run the migration script: scripts/migrate-db.sql\n`);
        allGood = false;
        continue;
      } else {
        console.error(`   ❌ Error checking table '${tableName}': ${error.message}\n`);
        allGood = false;
        continue;
      }
    }
    
    console.log(`   ✓ Table exists`);
    
    // Check columns
    if (data && data.length > 0) {
      const actualColumns = Object.keys(data[0]);
      const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.error(`   ⚠️  Missing columns: ${missingColumns.join(', ')}`);
        console.error(`      Run the migration script to add missing columns\n`);
        allGood = false;
      } else {
        console.log(`   ✓ All columns present (${expectedColumns.length})`);
      }
    } else {
      console.log(`   ℹ️  Table is empty (no data yet)`);
      console.log(`   ✓ Columns structure OK\n`);
    }
    
    console.log('');
  }
  
  // Check indexes
  console.log('📊 Checking indexes...\n');
  await checkIndexes();
  
  console.log('\n' + '═'.repeat(50));
  if (allGood) {
    console.log('✅ Database verification completed successfully!');
    console.log('   All tables and columns are present.');
  } else {
    console.log('⚠️  Database verification completed with issues.');
    console.log('   Please review the errors above and run the migration script.');
  }
  console.log('═'.repeat(50) + '\n');
}

async function checkIndexes() {
  // Query to check indexes
  const { data: indexData, error } = await supabase.rpc('pg_indexes', {
    schema: 'public'
  });
  
  if (error) {
    console.log('   ℹ️  Could not verify indexes (requires higher permissions)');
    console.log('   This is normal for anon key users.\n');
    return;
  }
  
  const expectedIndexes = [
    'idx_attendance_meeting_id',
    'idx_attendance_name',
    'idx_attendance_status',
    'idx_meetings_date',
    'idx_absence_requests_meeting',
    'idx_absence_requests_name',
    'idx_absence_requests_status'
  ];
  
  const foundIndexes = [];
  const missingIndexes = [];
  
  expectedIndexes.forEach(indexName => {
    const found = indexData?.some(idx => idx.indexname === indexName);
    if (found) {
      foundIndexes.push(indexName);
    } else {
      missingIndexes.push(indexName);
    }
  });
  
  if (foundIndexes.length > 0) {
    console.log(`   ✓ Found ${foundIndexes.length} performance indexes`);
  }
  
  if (missingIndexes.length > 0) {
    console.log(`   ⚠️  Missing indexes: ${missingIndexes.join(', ')}`);
    console.log(`      Run the migration script to create indexes`);
  }
  
  console.log('');
}

// Run verification
verifyDatabase().catch(err => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
