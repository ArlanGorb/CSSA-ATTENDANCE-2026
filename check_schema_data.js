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

async function check() {
  const { data, error } = await supabase.from('user_profiles').select('*').limit(3);
  if (error) {
    console.error(error);
  } else {
    console.log('Total profiles fetched:', data.length);
    data.forEach(p => {
      console.log(`Name: ${p.name}`);
      console.log(`Descriptor Type: ${typeof p.face_descriptor}`);
      if (Array.isArray(p.face_descriptor)) {
        console.log(`Descriptor IsArray: true, Length: ${p.face_descriptor.length}`);
        if (p.face_descriptor.length > 0) {
            console.log(`First element type: ${typeof p.face_descriptor[0]}`);
        }
      }
      console.log('---');
    });
  }
}

check();
