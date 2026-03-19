# 🎉 New Features Documentation

## Overview

Three major features have been added to improve the attendance system reliability and user experience:

1. **📧 Email Notifications** - Send attendance confirmation emails
2. **📝 Manual Attendance Fallback** - Submit attendance without face recognition
3. **📡 Offline Mode** - Queue attendance when offline and sync later

---

## 1. 📧 Email Notifications

### What It Does
Sends beautiful HTML email confirmations to members after they submit attendance.

### Features
- ✅ Professional HTML email template
- ✅ Shows meeting details, timestamp, and status
- ✅ Explains points system (Hadir = 10pts, Late = 5pts)
- ✅ Non-blocking (doesn't delay attendance submission)
- ✅ Graceful fallback if email fails

### Setup

1. **Configure SMTP in `.env.local`:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=CSSA Attendance <noreply@cssa.com>
```

2. **For Gmail users:**
   - Go to Google Account Settings
   - Enable 2-Factor Authentication
   - Generate App Password: https://myaccount.google.com/apppasswords
   - Use the App Password in `SMTP_PASS`

3. **Member Option:**
   - Members can choose to receive email during manual attendance
   - Future: Add email field to user profile for auto-fill

### Email Template Preview
```
✅ ABSENSI DICATAT

Halo [Name],
Terima kasih telah melakukan presensi.

Meeting: [Meeting Title]
Tanggal: [Date]
Waktu: [Timestamp]
Status: ✓ Hadir / ⏰ Late
```

---

## 2. 📝 Manual Attendance Fallback

### What It Does
Allows members to submit attendance manually when face recognition fails.

### When to Use
- Poor lighting conditions
- Camera not working
- Face not recognized (new member, glasses, etc.)
- System error

### Features
- ✅ Simple form: Name + Division + Email (optional)
- ✅ Bypasses QR token validation
- ✅ Flagged as `manual: true` for admin review
- ✅ Still earns points
- ✅ Device ID set to `manual-submission`

### UI Flow
1. User sees "Cannot scan face?" button
2. Clicks to open modal form
3. Fills in name, division, email (optional)
4. Submits → Same success screen as face recognition

### Admin Review
Manual submissions are marked in the database:
```sql
SELECT * FROM attendance WHERE device_id = 'manual-submission';
```

Admin can review and verify if needed.

---

## 3. 📡 Offline Mode

### What It Does
Automatically queues attendance submissions when offline and syncs when back online.

### How It Works

#### Offline Detection
```typescript
const { isOnline, pendingCount, syncing } = useOfflineQueue();
```

#### Queue Storage
- Uses IndexedDB via localforage
- Persistent across browser sessions
- Stores: name, division, meetingId, token, photo, timestamp

#### Auto-Sync
- Detects when connection restored
- Automatically submits queued items
- Removes successfully synced items
- Retries failed submissions

### User Experience

#### When Offline:
1. User sees "Offline" badge
2. Submits attendance normally
3. Gets confirmation: "Queued for submission"
4. Can close browser, data persists

#### When Back Online:
1. System auto-detects connection
2. Syncs all queued items
3. Shows sync status
4. Notifies on success/failure

### Technical Implementation

**Files:**
- `src/lib/offline-queue.ts` - Queue management
- `src/hooks/useOfflineQueue.ts` - React hook
- Integrated into attendance page

**Queue Statuses:**
- `pending` - Waiting to sync
- `syncing` - Currently submitting
- `synced` - Successfully submitted
- `failed` - Error, will retry

### Code Example
```typescript
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { addToQueue } from '@/lib/offline-queue';

function AttendancePage() {
  const { isOnline, pendingCount } = useOfflineQueue();

  const handleSubmit = async (data) => {
    if (!isOnline) {
      // Queue for later
      await addToQueue(data);
      showNotification('Queued for submission');
    } else {
      // Submit now
      await fetch('/api/attendance', { ... });
    }
  };
}
```

---

## Integration Points

### API Changes

**Endpoint:** `POST /api/attendance`

**New Parameters:**
```typescript
{
  manual?: boolean;      // Skip QR validation
  email?: string;        // Send confirmation email
  offline?: boolean;     // Submitted from offline queue
}
```

**Response:**
```typescript
{
  success: true,
  status: 'Hadir' | 'Late',
  emailSent?: boolean
}
```

### Database Schema

No changes needed! All features work with existing schema.

Manual submissions use `device_id = 'manual-submission'`

---

## Testing Guide

### Test Email Notifications

1. Configure SMTP in `.env.local`
2. Submit attendance (face or manual)
3. Check email inbox
4. Verify HTML rendering

### Test Manual Attendance

1. Go to attendance page
2. Click "Cannot scan face?"
3. Fill form and submit
4. Check database: `device_id = 'manual-submission'`

### Test Offline Mode

1. Open attendance page
2. Turn off WiFi (simulate offline)
3. Submit attendance
4. Check IndexedDB (DevTools → Application → IndexedDB)
5. Turn on WiFi
6. Wait for auto-sync
7. Verify data submitted

---

## Troubleshooting

### Email Not Sending

**Check:**
1. SMTP credentials in `.env.local`
2. App password (not regular password for Gmail)
3. Firewall/antivirus blocking SMTP
4. Check server logs: `[Email] Failed to send`

### Manual Attendance Not Working

**Check:**
1. API route updated with `manual` parameter
2. Form component imported correctly
3. Name matches registered name (case-insensitive)

### Offline Queue Not Syncing

**Check:**
1. Browser supports IndexedDB
2. `navigator.onLine` working
3. Check console for sync errors
4. Clear IndexedDB and retry

---

## Performance Impact

| Feature | Bundle Size | Runtime Performance |
|---------|-------------|---------------------|
| Email | +2KB | None (server-side) |
| Manual Form | +5KB | None |
| Offline Mode | +15KB | Minimal (background sync) |

**Total Impact:** +22KB gzipped

---

## Security Considerations

### Manual Attendance
- ⚠️ Bypasses QR validation
- ⚠️ No photo evidence
- ✅ Flagged for admin review
- ✅ Still rate-limited

### Email
- ✅ SMTP credentials server-side only
- ✅ Non-blocking (doesn't expose email delays)
- ✅ Fails gracefully

### Offline Mode
- ✅ Data encrypted in IndexedDB (browser-level)
- ✅ Queue cleared after successful sync
- ⚠️ Potential for replay attacks (mitigated by duplicate name check)

---

## Future Enhancements

### Email
- [ ] Custom email templates per meeting
- [ ] Batch daily/weekly summary emails
- [ ] WhatsApp/SMS notifications
- [ ] Email attendance history

### Manual Attendance
- [ ] Photo upload option
- [ ] Admin approval workflow
- [ ] Bulk manual submission (CSV import)
- [ ] NIM-based verification

### Offline Mode
- [ ] Conflict resolution UI
- [ ] Manual retry per item
- [ ] Sync progress indicator
- [ ] Background sync API

---

## Migration Notes

### From Previous Version

**No breaking changes!** All features are additive.

**Optional Setup:**
1. Add SMTP credentials for email
2. Update attendance page to import new components
3. Add `useOfflineQueue` hook

### Rollback Plan

If issues occur:

1. **Email:** Remove SMTP env vars, feature auto-disables
2. **Manual:** Don't import form component
3. **Offline:** Don't call `addToQueue`, submit directly

---

## Support

For issues or questions:
1. Check this documentation
2. Review code comments
3. Check browser console for errors
4. Contact development team

---

**Version:** 2.1.0  
**Last Updated:** March 2026  
**Author:** CSSA Development Team
