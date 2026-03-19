/**
 * Environment Validation Utility
 * Validates that all required environment variables are set
 */

export function validateEnv() {
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];

  const missing: string[] = [];
  const invalid: string[] = [];

  requiredEnvVars.forEach((varName) => {
    const value = process.env[varName];

    if (!value) {
      missing.push(varName);
    } else if (value === `your_${varName.replace('NEXT_PUBLIC_', '').toLowerCase()}`) {
      invalid.push(varName);
    }
  });

  // Validate Supabase URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.startsWith('https://') && !supabaseUrl.startsWith('http://')) {
    invalid.push('NEXT_PUBLIC_SUPABASE_URL (must be a valid URL)');
  }

  // Validate Supabase Anon Key format (should be a JWT)
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseKey && !supabaseKey.startsWith('eyJ')) {
    invalid.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (must be a valid JWT key)');
  }

  return { missing, invalid };
}

export function getEnvStatus() {
  const { missing, invalid } = validateEnv();
  
  if (missing.length > 0 || invalid.length > 0) {
    return {
      valid: false,
      message: `Environment configuration issues found: ${[...missing, ...invalid].join(', ')}`,
      missing,
      invalid,
    };
  }

  return {
    valid: true,
    message: 'Environment configuration is valid',
    missing: [],
    invalid: [],
  };
}
