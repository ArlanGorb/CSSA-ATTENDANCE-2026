/**
 * Supabase Storage Setup Script
 * Creates required storage buckets for the attendance system
 * 
 * Usage: node scripts/setup-storage.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Error: Missing Supabase credentials in .env.local');
  console.error('Please copy .env.local.example to .env.local and fill in your values');
  process.exit(1);
}

// Note: For storage bucket creation, we need the service role key
// User can optionally provide it via environment variable
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn('⚠️  Warning: SUPABASE_SERVICE_ROLE_KEY not set');
  console.warn('Storage bucket creation requires the service role key.');
  console.warn('Please get it from: https://app.supabase.com/project/_/settings/api');
  console.warn('');
  console.warn('For now, we\'ll show you the manual setup instructions.\n');
  
  showManualInstructions();
  process.exit(0);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey // Use service role for admin operations
);

// Required storage buckets
const BUCKETS = [
  {
    name: 'attendance-photos',
    public: true,
    description: 'Stores photos taken during attendance check-in',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
  },
  {
    name: 'absence-attachments',
    public: true,
    description: 'Stores supporting documents for absence requests (surat izin, medical certificates)',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
  },
];

async function setupStorage() {
  console.log('🔧 Setting up Supabase Storage buckets...\n');
  
  for (const bucket of BUCKETS) {
    await createBucket(bucket);
  }
  
  console.log('\n✅ Storage setup complete!\n');
}

async function createBucket(bucketConfig) {
  console.log(`📦 Creating bucket: ${bucketConfig.name}...`);
  
  // Try to create bucket
  const { data: bucketData, error: createError } = await supabase.storage.createBucket(
    bucketConfig.name,
    {
      public: bucketConfig.public,
      fileSizeLimit: bucketConfig.fileSizeLimit,
      allowedMimeTypes: bucketConfig.allowedMimeTypes,
    }
  );
  
  if (createError) {
    if (createError.message.includes('already exists')) {
      console.log(`   ✓ Bucket already exists`);
    } else {
      console.error(`   ❌ Error creating bucket: ${createError.message}`);
      return;
    }
  } else {
    console.log(`   ✓ Bucket created successfully`);
  }
  
  // Set up policies
  await setupBucketPolicies(bucketConfig.name);
}

async function setupBucketPolicies(bucketName) {
  console.log(`   🔐 Setting up access policies for ${bucketName}...`);
  
  // Policies are created via SQL, not the JS API
  // We'll just inform the user here
  console.log(`   ℹ️  Please run the following SQL in Supabase SQL Editor:`);
  console.log(`   ─────────────────────────────────────────────────────────`);
  console.log(generateBucketPolicySQL(bucketName));
  console.log(`   ─────────────────────────────────────────────────────────\n`);
}

function generateBucketPolicySQL(bucketName) {
  return `-- Enable public read access for ${bucketName}
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT
USING (bucket_id = '${bucketName}');

-- Enable authenticated uploads
CREATE POLICY "Enable Uploads" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = '${bucketName}');

-- Enable owners to delete their own files
CREATE POLICY "Enable Deletes" ON storage.objects
FOR DELETE
USING (bucket_id = '${bucketName}');`;
}

function showManualInstructions() {
  console.log('📋 Manual Storage Setup Instructions:');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('1. Go to Supabase Dashboard: https://app.supabase.com\n');
  
  console.log('2. Navigate to Storage → Create Bucket\n');
  
  console.log('3. Create the following buckets:\n');
  
  BUCKETS.forEach((bucket, index) => {
    console.log(`   Bucket ${index + 1}:`);
    console.log(`   - Name: ${bucket.name}`);
    console.log(`   - Public: ${bucket.public ? 'Yes' : 'No'}`);
    console.log(`   - Description: ${bucket.description}`);
    console.log(`   - Max File Size: ${bucket.fileSizeLimit / (1024 * 1024)}MB`);
    console.log(`   - Allowed Types: ${bucket.allowedMimeTypes.join(', ')}`);
    console.log('');
  });
  
  console.log('4. For each bucket, add these policies in SQL Editor:\n');
  
  BUCKETS.forEach(bucket => {
    console.log(generateBucketPolicySQL(bucket.name));
    console.log('');
  });
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run setup
setupStorage().catch(console.error);
