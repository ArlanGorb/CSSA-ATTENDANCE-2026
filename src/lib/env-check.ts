import { validateEnv, getEnvStatus } from './env';

// Run validation on module load in development
if (process.env.NODE_ENV === 'development') {
  const status = getEnvStatus();
  
  if (!status.valid) {
    console.warn('⚠️  Environment Validation Warning:');
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (status.missing.length > 0) {
      console.warn('❌ Missing environment variables:');
      status.missing.forEach((v) => console.warn(`   - ${v}`));
      console.warn('');
    }
    
    if (status.invalid.length > 0) {
      console.warn('⚠️  Invalid environment variables:');
      status.invalid.forEach((v) => console.warn(`   - ${v}`));
      console.warn('');
    }
    
    console.warn('📝 Please copy .env.local.example to .env.local and fill in your values');
    console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    console.log('✅ Environment validation passed');
  }
}

// Export for use in API routes
export { validateEnv, getEnvStatus };
