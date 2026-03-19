# Changelog

All notable changes to the Presensi CSSA Attendance System.

## [2.0.0] - 2026-03-19

### 🔒 Security Improvements

- **Added environment validation** - New utility to validate Supabase credentials on startup
- **Removed hardcoded credentials** - Removed exposed Supabase URL and key from `check_schema_data.js`
- **Added rate limiting** - Implemented rate limiting middleware for API routes
  - 5 requests/minute for attendance submission
  - 20 requests/minute for face profile operations
- **Server-side QR token validation** - Enhanced QR token expiry checking with timezone awareness
- **Production RLS policies** - Created comprehensive Row Level Security policies for production

### 🐛 Bug Fixes

- **Profile update cascade** - Fixed division updates to cascade across all tables (attendance, absence_requests)
- **Duplicate Leaderboard link** - Removed duplicate link on homepage
- **QR token expiry** - Fixed timezone handling for token expiry validation
- **Environment validation** - Added checks to prevent app from running without proper configuration

### ✨ New Features

- **Error Boundary** - Added global error boundary component to handle crashes gracefully
- **Database migration script** - Created `scripts/migrate-db.sql` for easy database setup
- **Database verification** - Added `scripts/verify-db.js` to check database schema
- **Storage setup script** - Created `scripts/setup-storage.js` for automatic bucket creation
- **Environment check on startup** - Development warnings for missing/invalid environment variables

### 📚 Documentation

- **SETUP_GUIDE.md** - Comprehensive setup and configuration guide
- **CHANGELOG.md** - This changelog file
- **Updated .env.local.example** - Enhanced with comments and optional variables

### 🔧 Technical Improvements

- **Cascade updates** - Profile division changes now update attendance and absence records
- **Better error handling** - Improved error messages and logging throughout
- **Code organization** - Moved utilities to `src/lib/` directory
- **TypeScript support** - Added proper TypeScript types for new utilities

### 📦 New Files

- `src/lib/env.ts` - Environment validation utility
- `src/lib/env-check.ts` - Environment check on module load
- `src/lib/rate-limit.ts` - Rate limiting middleware
- `src/components/ErrorBoundary.tsx` - Global error boundary
- `scripts/migrate-db.sql` - Database migration script
- `scripts/verify-db.js` - Database verification script
- `scripts/setup-storage.js` - Storage bucket setup script
- `scripts/production-rls.sql` - Production RLS policies
- `SETUP_GUIDE.md` - Complete setup documentation
- `CHANGELOG.md` - This changelog

### ⚠️ Breaking Changes

- **Environment variables required** - App now validates environment variables on startup
- **Rate limiting enabled** - API calls are now rate limited (may affect automated scripts)

### 🎯 Migration Guide

1. Copy `.env.local.example` to `.env.local`
2. Fill in your Supabase credentials
3. Run `node scripts/verify-db.js` to check configuration
4. Run `scripts/migrate-db.sql` in Supabase SQL Editor
5. Create storage buckets (see SETUP_GUIDE.md)

---

## [1.0.0] - 2026-03-XX

### Initial Release

- Face recognition-based attendance system
- QR code check-in
- Admin dashboard
- User profiles
- Leaderboard
- Analytics dashboard
- Absence request system
- Real-time attendance monitoring
- Security logs for intrusion detection

---

## Version History

- **2.0.0** - Major security and stability improvements
- **1.0.0** - Initial release

---

**Legend**:
- 🔒 Security
- 🐛 Bug Fixes
- ✨ New Features
- 📚 Documentation
- 🔧 Technical Improvements
- ⚠️ Breaking Changes
- 🎯 Migration Guide
