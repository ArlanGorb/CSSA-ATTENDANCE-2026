/**
 * Manual Attendance Form Component
 * Fallback for when face recognition fails
 */

'use client';

import { useState } from 'react';
import { User, Briefcase, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

interface ManualAttendanceFormProps {
  meetingId: string;
  token: string | null;
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export default function ManualAttendanceForm({
  meetingId,
  token,
  onSuccess,
  onError,
  onClose
}: ManualAttendanceFormProps) {
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wantEmail, setWantEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !division) {
      onError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          token,
          name: name.trim(),
          division,
          deviceId: 'manual-submission',
          manual: true,
          email: wantEmail ? email : null
        })
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess({
          name: name.trim(),
          division,
          status: data.status
        });
      } else {
        onError(data.error || 'Failed to submit attendance');
      }
    } catch (err: any) {
      onError('Connection failed. Please check your internet.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <User className="w-6 h-6" />
            Manual Attendance
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            Submit attendance without face recognition
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Enter your registered name"
                required
              />
            </div>
          </div>

          {/* Division */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Division *
            </label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all appearance-none bg-white"
                required
              >
                <option value="">Select division</option>
                {DIVISIONS.map((div) => (
                  <option key={div} value={div}>{div}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Email Notification */}
          <div className="bg-gray-50 p-4 rounded-xl">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wantEmail}
                onChange={(e) => setWantEmail(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Get email confirmation
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Receive attendance confirmation via email
                </p>
              </div>
            </label>

            {wantEmail && (
              <div className="mt-3 animate-fadeIn">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
                    placeholder="your@email.com"
                    required={wantEmail}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  Important Notes
                </p>
                <ul className="text-xs text-blue-700 mt-1 space-y-1">
                  <li>• Manual attendance will be flagged for admin review</li>
                  <li>• No photo will be taken for manual submissions</li>
                  <li>• You still earn points for attendance</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl transition-all font-medium flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Submit Attendance
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
