const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mwsteuqbtoeavdwkryrq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13c3RldXFidG9lYXZkd2tyeXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MjU5ODEsImV4cCI6MjA4ODUwMTk4MX0.oIK7UNtoYUKCew_L8u5caYr-bIuPp4YdS4nSkbgXWJY';

const supabase = createClient(supabaseUrl, supabaseKey);

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
