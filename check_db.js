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
  const { data, error } = await supabase.from('meetings').select('*').limit(1).order('created_at', { ascending: false });
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data[0], null, 2));
  }
}

check();
