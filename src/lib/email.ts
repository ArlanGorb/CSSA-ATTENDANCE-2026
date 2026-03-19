/**
 * Email Service for Attendance Notifications
 * Uses Nodemailer with SMTP
 */

import nodemailer from 'nodemailer';

interface AttendanceEmailData {
  name: string;
  email?: string;
  meetingTitle: string;
  meetingDate: string;
  status: 'Hadir' | 'Late';
  timestamp: string;
}

// Create transporter
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP configuration not found. Email notifications disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send attendance confirmation email
 */
export async function sendAttendanceEmail(
  to: string,
  data: AttendanceEmailData
): Promise<boolean> {
  const transporter = createTransporter();
  
  if (!transporter) {
    return false;
  }

  const subject = `✅ Absensi Berhasil - ${data.meetingTitle}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .success-badge { display: inline-block; background: #22c55e; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
    .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 5px; }
    .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
    .info-label { font-weight: bold; color: #666; }
    .info-value { color: #333; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 5px; font-weight: bold; margin-top: 10px; }
    .status-hadir { background: #22c55e; color: white; }
    .status-late { background: #eab308; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Presensi Berhasil!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">CSSA BEM FILKOM</p>
    </div>
    
    <div class="content">
      <div class="success-badge">✅ ABSENSI DICATAT</div>
      
      <p>Halo <strong>${data.name}</strong>,</p>
      <p>Terima kasih telah melakukan presensi. Berikut adalah detail kehadiran Anda:</p>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Meeting:</span>
          <span class="info-value">${data.meetingTitle}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Tanggal:</span>
          <span class="info-value">${data.meetingDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Waktu Presensi:</span>
          <span class="info-value">${data.timestamp}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="status-badge ${data.status === 'Hadir' ? 'status-hadir' : 'status-late'}">
            ${data.status === 'Hadir' ? '✓ Hadir' : '⏰ Late'}
          </span>
        </div>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        <strong>Catatan:</strong> Jika Anda hadir tepat waktu, status Anda adalah "Hadir" dan Anda mendapatkan 10 poin. 
        Jika terlambat, status Anda adalah "Late" dan Anda mendapatkan 5 poin.
      </p>
      
      <div class="footer">
        <p>Email ini dikirim secara otomatis oleh sistem Presensi CSSA.</p>
        <p>&copy; ${new Date().getFullYear()} Computer Science Student Association</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
ABSENSI BERHASIL - CSSA BEM FILKOM

Halo ${data.name},

Terima kasih telah melakukan presensi. Berikut adalah detail kehadiran Anda:

Meeting: ${data.meetingTitle}
Tanggal: ${data.meetingDate}
Waktu Presensi: ${data.timestamp}
Status: ${data.status === 'Hadir' ? '✓ Hadir' : '⏰ Late'}

Catatan: Jika Anda hadir tepat waktu, status Anda adalah "Hadir" dan Anda mendapatkan 10 poin.
Jika terlambat, status Anda adalah "Late" dan Anda mendapatkan 5 poin.

---
Email ini dikirim secara otomatis oleh sistem Presensi CSSA.
© ${new Date().getFullYear()} Computer Science Student Association
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'CSSA Attendance <noreply@cssa.com>',
      to,
      subject,
      text,
      html,
    });

    console.log(`[Email] Sent to ${to} for ${data.name}`);
    return true;
  } catch (error: any) {
    console.error(`[Email] Failed to send to ${to}:`, error.message);
    return false;
  }
}
