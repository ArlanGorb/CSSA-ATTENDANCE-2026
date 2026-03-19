'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Upload, CheckCircle, ArrowLeft, Calendar, User, Briefcase, X, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Meeting {
  id: string;
  title: string;
  date: string;
}

export default function AbsenceRequestPage() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState('');
  const [absenceType, setAbsenceType] = useState<'Izin' | 'Sakit'>('Izin');
  const [reason, setReason] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  
  // Data fetching
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);

  const DIVISIONS = [
    "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
    "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
  ];

  useEffect(() => {
    fetchMeetings();
    // Load saved user data
    const savedName = localStorage.getItem('cssa_user_name');
    if (savedName) {
      setName(savedName);
      fetchMyRequests(savedName);
    }
  }, []);

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('id, title, date')
      .or('is_archived.eq.false,is_archived.is.null')
      .order('date', { ascending: false });
    
    if (data) setMeetings(data);
    if (error) console.error('Error fetching meetings:', error);
  };

  const fetchMyRequests = async (userName: string) => {
    const { data, error } = await supabase
      .from('absence_requests')
      .select(`
        *,
        meetings (
          title,
          date
        )
      `)
      .eq('name', userName)
      .order('created_at', { ascending: false });
    
    if (data) setMyRequests(data);
    if (error) console.error('Error fetching requests:', error);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('File size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file');
        return;
      }
      setAttachmentFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !division || !selectedMeeting || !reason) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let attachmentUrl = null;
      
      // Upload attachment if provided
      if (attachmentFile) {
        const fileExt = attachmentFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('absence-attachments')
          .upload(fileName, attachmentFile);
        
        if (uploadError) {
          console.error('Upload error:', uploadError);
          // Continue without attachment for now
        } else {
          const { data: urlData } = supabase.storage
            .from('absence-attachments')
            .getPublicUrl(fileName);
          attachmentUrl = urlData.publicUrl;
        }
      }

      // Create absence request
      const { error: insertError } = await supabase
        .from('absence_requests')
        .insert({
          name,
          division,
          meeting_id: selectedMeeting,
          absence_type: absenceType,
          reason,
          attachment_url: attachmentUrl,
          status: 'pending'
        });

      if (insertError) throw insertError;

      setSuccess(true);
      setAttachmentFile(null);
      setAttachmentPreview(null);
      setReason('');
      setSelectedMeeting('');
      
      // Refresh requests list
      fetchMyRequests(name);
      
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'approved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      {/* Background Ambience */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
          <ArrowLeft size={20} />
          Back to Home
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-xl bg-blue-500/10 ring-1 ring-blue-400/30">
              <FileText className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold">Submit Absence Request</h1>
          </div>
          <p className="text-slate-400">Request permission (Izin) or sick leave (Sakit) for a meeting</p>
        </div>

        {success && (
          <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 rounded-xl flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-green-400">Request submitted successfully! Admin will review it soon.</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Request Form */}
          <div className="md:col-span-2">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
              <h2 className="text-xl font-bold mb-6">New Request</h2>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      placeholder="Enter your registered name"
                      required
                    />
                  </div>
                </div>

                {/* Division */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Division *
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                      value={division}
                      onChange={(e) => setDivision(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none"
                      required
                    >
                      <option value="">Select division</option>
                      {DIVISIONS.map((div) => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Meeting */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Meeting *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                      value={selectedMeeting}
                      onChange={(e) => setSelectedMeeting(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none"
                      required
                    >
                      <option value="">Select meeting</option>
                      {meetings.map((meeting) => (
                        <option key={meeting.id} value={meeting.id}>
                          {meeting.title} - {new Date(meeting.date).toLocaleDateString('en-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Absence Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Absence Type *
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAbsenceType('Izin')}
                      className={`p-3 rounded-xl border transition-all font-medium ${
                        absenceType === 'Izin'
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      Izin (Permission)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbsenceType('Sakit')}
                      className={`p-3 rounded-xl border transition-all font-medium ${
                        absenceType === 'Sakit'
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      Sakit (Sick Leave)
                    </button>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Reason *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                    placeholder="Explain your absence reason..."
                    required
                  />
                </div>

                {/* Attachment */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Attachment (Optional)
                  </label>
                  <div className="border-2 border-dashed border-white/10 rounded-xl p-4">
                    {attachmentPreview ? (
                      <div className="relative">
                        <img
                          src={attachmentPreview}
                          alt="Preview"
                          className="max-h-48 rounded-lg mx-auto"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentFile(null);
                            setAttachmentPreview(null);
                          }}
                          className="absolute top-2 right-2 p-2 bg-red-500/80 rounded-full hover:bg-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                        <Upload className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-sm text-slate-400">Click to upload image</span>
                        <span className="text-xs text-slate-500 mt-1">Max 5MB (JPG, PNG)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Submit Request
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Request History */}
          <div className="md:col-span-1">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
              <h2 className="text-xl font-bold mb-6">My Requests</h2>
              
              {myRequests.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No requests yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {myRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 bg-white/5 rounded-xl border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${getStatusColor(request.status)}`}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {request.absence_type}
                        </span>
                      </div>
                      <p className="font-medium text-sm mb-1">
                        {request.meetings?.title || 'Unknown Meeting'}
                      </p>
                      <p className="text-xs text-slate-400 mb-2">
                        {new Date(request.meetings?.date).toLocaleDateString('en-ID', { day: 'numeric', month: 'short' })}
                      </p>
                      {request.admin_note && (
                        <div className="mt-2 p-2 bg-white/5 rounded-lg">
                          <p className="text-xs text-slate-300">
                            <span className="font-medium">Admin:</span> {request.admin_note}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
