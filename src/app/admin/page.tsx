'use client';
import { useState, useEffect } from 'react';

import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { PlusCircle, QrCode, RefreshCcw, Users, Clock, CheckCircle, AlertTriangle, Download, Lock, Maximize2, X, Trash2, Archive, RotateCcw, Terminal, ShieldAlert, Image as ImageIcon, Camera, Menu, UserCircle, Search, Upload, Loader2, Sparkles } from 'lucide-react';
import * as faceapi from 'face-api.js';

type FaceProfile = {
  id: string;
  name: string;
  division: string;
  face_descriptor: number[] | number[][];
};


import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan", 
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [qrToken, setQrToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [showFullScreenQR, setShowFullScreenQR] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // New state for archiving
  const [latestAttendee, setLatestAttendee] = useState<any>(null); // For Realtime Sci-fi Notification
  
  // Security specific states
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null); // State for photo modal
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // New Management view states
  const [activeView, setActiveView] = useState<'meetings' | 'students'>('meetings');
  const [allStudents, setAllStudents] = useState<FaceProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Face Training states
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [trainingStudent, setTrainingStudent] = useState<FaceProfile | null>(null);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);


  // Simple Auth Check
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '8182838485') { // Updated secure password
      setIsAuthenticated(true);
      localStorage.setItem('cssa_admin_auth', 'true');
    } else {
      alert('Incorrect Password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('cssa_admin_auth');
    setSelectedMeeting(null);
  };

  useEffect(() => {
    const auth = localStorage.getItem('cssa_admin_auth');
    if (auth === 'true') setIsAuthenticated(true);
    fetchMeetings();
    loadModels();
    fetchAllStudents();
  }, [showArchived]); // Re-fetch on toggle

  const loadModels = async () => {
    try {
      if (modelsLoaded) return;
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ]);
      setModelsLoaded(true);
    } catch (err) {
      console.error("Error loading face models:", err);
    }
  };

  const fetchAllStudents = async () => {
    try {
      const res = await fetch('/api/face-profiles');
      const data = await res.json();
      if (data.profiles) {
        setAllStudents(data.profiles);
      }
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    
    let interval: NodeJS.Timeout;
    if (selectedMeeting && !selectedMeeting.is_archived) {
      fetchAttendance(selectedMeeting.id);
      setQrToken(selectedMeeting.qr_token || 'Initializing...');
      
      // Initial fetch to ensure data is fresh
      fetchAttendance(selectedMeeting.id);

      // Realtime Subscription
      const channel = supabase
        .channel('attendance_updates')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'attendance',
            filter: `meeting_id=eq.${selectedMeeting.id}`,
          },
          (payload: any) => {
            setAttendances((prev) => [payload.new as any, ...prev]);
            setLatestAttendee(payload.new);
            // Auto hide notification after 5 seconds
            setTimeout(() => {
               setLatestAttendee(null);
            }, 5000);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'security_logs',
            filter: `meeting_id=eq.${selectedMeeting.id}`,
          },
          (payload: any) => {
            setSecurityLogs((prev) => [payload.new as any, ...prev]);
            // Flash dashboard red on attack
            setShowSecurityDashboard(true);
          }
        )
        .subscribe();

      // Refresh QR every 5 mins (300000ms)
      interval = setInterval(() => {
        refreshQRToken(selectedMeeting.id);
      }, 300000);

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    } else if (selectedMeeting?.is_archived) {
        fetchAttendance(selectedMeeting.id);
    }
  }, [selectedMeeting, isAuthenticated]);

  const fetchMeetings = async () => {
    let query = supabase.from('meetings').select('*').order('created_at', { ascending: false });
    
    // Default filter for non-archived, or explicit for archived
    if (showArchived) {
        query = query.is('is_archived', true);
    } else {
        // Handle null values as false for backward compatibility
        query = query.or('is_archived.eq.false,is_archived.is.null');
    }

    const { data, error } = await query;
    if (data) {
        setMeetings(data);
        // Clear selection if switching modes
        setSelectedMeeting(null);
    }
    if (error) console.error("Error fetching meetings:", error);
  };

  const fetchAttendance = async (meetingId: string) => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('timestamp', { ascending: false });
    
    if (data) setAttendances(data);

    // Fetch security logs for this meeting too
    const { data: logs } = await supabase
      .from('security_logs')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('timestamp', { ascending: false });
    
    if (logs) setSecurityLogs(logs);
  };

  const refreshQRToken = async (meetingId: string) => {
    if (showArchived) return;
    
    const newToken = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60000 * 5); // Valid for 5 minutes.
    await supabase.from('meetings').update({ 
      qr_token: newToken, 
      qr_expiry: expiry.toISOString() 
    }).eq('id', meetingId);
    
    setQrToken(newToken);
  };

  const handleArchive = async (meetingId: string, archive: boolean) => {
    if (confirm(`Are you sure you want to ${archive ? 'archive' : 'restore'} this meeting?`)) {
        await supabase.from('meetings').update({ is_archived: archive }).eq('id', meetingId);
        fetchMeetings();
    }
  };

  const handleDelete = async (meetingId: string) => {
    if (confirm('Are you sure you want to permanently delete this meeting? This action cannot be undone.')) {
        const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
        if (error) {
            alert('Error deleting meeting: ' + error.message);
        } else {
            fetchMeetings();
            if (selectedMeeting?.id === meetingId) setSelectedMeeting(null);
        }
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = e.target as HTMLFormElement;
    
    const { error } = await supabase.from('meetings').insert([{
      title: form.meetingTitle.value,
      date: form.date.value,
      start_time: form.startTime.value,
      attendance_limit_minutes: parseInt(form.limit.value),

      is_archived: false,
      qr_token: crypto.randomUUID(), // Initial token
      qr_expiry: new Date(Date.now() + 60000 * 5).toISOString()
    }]);

    if (!error) {
      fetchMeetings();
      setCreateFormVisible(false);
      form.reset();
    } else {
      alert('Error creating meeting: ' + error.message);
    }
    setLoading(false);
  };

  const handleExportCSV = () => {
    if (!attendances.length) return;
    
    // Create CSV content
    const headers = ['Time', 'Name', 'Division', 'Status'];
    const rows = attendances.map(a => [
      format(new Date(a.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      `"${a.name}"`, // Quote to handle commas in names
      a.division,
      a.status
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
      
    // Download logic
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedMeeting?.title}_Attendance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (!selectedMeeting || attendances.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(18);
    doc.text('REKAPITULASI KEHADIRAN CSSA', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Sesi: ${selectedMeeting.title}`, 14, 35);
    doc.text(`Tanggal: ${format(new Date(selectedMeeting.created_at), 'dd MMMM yyyy')}`, 14, 42);
    doc.text(`Dicetak pada: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 49);

    // Table
    const tableData = attendances.map((a, i) => [
      i + 1,
      a.name,
      a.division,
      format(new Date(a.timestamp), 'HH:mm'),
      a.status
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['No', 'Nama Lengkap', 'Divisi', 'Waktu', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 40 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
      }
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Ringkasan Kehadiran:', 14, finalY + 15);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Hadir: ${stats.hadir}`, 14, finalY + 22);
    doc.text(`Late: ${stats.late}`, 14, finalY + 29);
    doc.text(`Sakit/Izin: ${stats.izin + stats.sakit}`, 14, finalY + 36);
    doc.text(`Total Peserta: ${stats.total}`, 14, finalY + 43);

    doc.save(`Recap_${selectedMeeting.title}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const updateStatus = async (attendanceId: string, newStatus: string) => {
    await supabase.from('attendance').update({ status: newStatus }).eq('id', attendanceId);
    if (selectedMeeting) fetchAttendance(selectedMeeting.id);
  };

  const handleTrainingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !modelsLoaded || !trainingStudent) return;

    setSubmitting(true);
    setTrainingStatus('Memproses foto...');
    setError(null);

    try {
      const img = await faceapi.bufferToImage(file);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setError('Wajah tidak terdeteksi dalam foto. Gunakan foto yang lebih jelas.');
        setSubmitting(false);
        return;
      }

      await submitFaceProfile([detection.descriptor]);
    } catch (err) {
      console.error('[FaceAPI] Photo processing error:', err);
      setError('Gagal memproses foto.');
      setSubmitting(false);
    }
  };

  const submitFaceProfile = async (descriptors: Float32Array[]) => {
    if (!trainingStudent) return;

    setSubmitting(true);
    setTrainingStatus('Menyimpan sampel pelatihan...');

    try {
      const payloadDescriptors = descriptors.map(d => Array.from(d));

      const res = await fetch('/api/face-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trainingStudent.name,
          division: trainingStudent.division,
          faceDescriptor: payloadDescriptors,
          action: 'append'
        }),
      });

      if (res.ok) {
        setSuccess(true);
        fetchAllStudents();
        setTimeout(() => {
          setIsTrainingModalOpen(false);
          setTrainingStudent(null);
          setSuccess(false);
        }, 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Gagal menyimpan profil wajah.');
      }
    } catch (err) {
      setError('Kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAttendance = async (attendanceId: string, memberName: string) => {
    if (confirm(`Are you sure you want to delete ${memberName}?`)) {
      const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);
      if (error) {
        alert('Error deleting: ' + error.message);
      } else {
        if (selectedMeeting) fetchAttendance(selectedMeeting.id);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Hadir': return 'border-green-500/50 text-green-400 bg-green-950/30';
      case 'Late': return 'border-yellow-500/50 text-yellow-400 bg-yellow-950/30';
      case 'Izin': return 'border-blue-500/50 text-blue-400 bg-blue-950/30';
      case 'Sakit': return 'border-purple-500/50 text-purple-400 bg-purple-950/30';
      case 'Alfa': return 'border-red-500/50 text-red-500 bg-red-950/30';
      default: return 'border-slate-500/50 text-slate-400 bg-slate-900/30';
    }
  };

  const stats = {
    hadir: attendances.filter(a => a.status === 'Hadir').length,
    late: attendances.filter(a => a.status === 'Late').length,
    izin: attendances.filter(a => a.status === 'Izin').length,
    sakit: attendances.filter(a => a.status === 'Sakit').length,
    alfa: attendances.filter(a => a.status === 'Alfa').length,
    total: attendances.length
  };

  // Construct attendance URL
  // Base URL needs to be dynamic or set in ENV. For dev, localhost:3000.
  // In production, user will deploy so window.location.origin is best.
  // We use window.location.origin but render only on client side.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const attendanceUrl = `${origin}/attend/${selectedMeeting?.id}?token=${qrToken}`;
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full max-w-md border border-slate-100">
          <div className="text-center mb-8">
            <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
              <Lock size={24} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Admin Dashboard</h2>
            <p className="text-sm text-slate-500">Sign in to manage attendance</p>
          </div>
          <div className="space-y-6">
            <div>
               <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
               <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
               />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all shadow-sm">
               Sign In
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex selection:bg-blue-100 overflow-x-hidden">
      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:flex'} flex flex-col h-screen`}>
         <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-black shadow-sm">
                C
              </div>
              CSSA Hub
            </h1>
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-600 p-1">
              <X size={20} />
            </button>
         </div>

         <div className="p-4 flex-1 overflow-y-auto">
            <div className="space-y-1">
               <button
                  onClick={() => setActiveView('meetings')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    activeView === 'meetings'
                      ? 'bg-blue-50 border-blue-100 text-blue-900 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
               >
                  <Clock size={18} className={activeView === 'meetings' ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="font-medium text-sm">Monitor Presensi</span>
               </button>
               <button
                  onClick={() => setActiveView('students')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    activeView === 'students'
                      ? 'bg-blue-50 border-blue-100 text-blue-900 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
               >
                  <Users size={18} className={activeView === 'students' ? 'text-blue-600' : 'text-slate-400'} />
                  <span className="font-medium text-sm">Data Mahasiswa</span>
               </button>
            </div>

            <div className="my-6 border-t border-slate-100"></div>

            <div className="flex justify-between items-center px-2 mb-4">
               <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {showArchived ? 'Archived' : 'Active'} Sessions
               </h3>
               {/* ... rest of existing buttons ... */}
               <div className="flex gap-1">
                   <button
                      onClick={() => {
                        setShowArchived(!showArchived);
                        setActiveView('meetings');
                      }}
                      className={`p-1.5 rounded-md transition-colors ${showArchived ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                      title={showArchived ? "Show Active" : "Show Archived"}
                    >
                      {showArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                   </button>
                   {!showArchived && (
                       <button
                          onClick={() => {
                            setCreateFormVisible(true);
                            setActiveView('meetings');
                          }}
                          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                          title="Initialize New Session"
                        >
                          <PlusCircle size={16} />
                       </button>
                   )}
                   <button
                      onClick={() => {
                        setShowSecurityDashboard(!showSecurityDashboard);
                        setActiveView('meetings');
                      }}
                      className={`p-1.5 rounded-md transition-colors ${showSecurityDashboard ? 'bg-red-50 text-red-600' : 'text-slate-400 hover:bg-slate-50 hover:text-red-600'}`}
                      title="Intrusion Logs"
                    >
                      <ShieldAlert size={16} />
                   </button>
               </div>
            </div>

            <div className="space-y-1">
               {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  onClick={() => {
                    setSelectedMeeting(meeting);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`group p-3 rounded-xl cursor-pointer transition-all border ${
                    selectedMeeting?.id === meeting.id
                      ? 'bg-blue-50 border-blue-100 text-blue-900 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                      <div>
                          <h4 className={`font-medium text-sm ${selectedMeeting?.id === meeting.id ? 'text-blue-700' : 'text-slate-700'}`}>
                             {meeting.title}
                          </h4>
                          <div className="text-xs mt-1.5 flex items-center gap-3 opacity-70">
                             <span className="flex items-center gap-1"><Clock size={10}/> {meeting.date}</span>
                          </div>
                      </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={`mt-3 pt-3 border-t flex justify-end gap-2 ${selectedMeeting?.id === meeting.id ? 'border-blue-200/50' : 'border-slate-200 hidden group-hover:flex'}`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(meeting.id, !meeting.is_archived); }}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title={meeting.is_archived ? "Restore Session" : "Archive Session"}
                      >
                        {meeting.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id); }}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete Permanently"
                      >
                        <Trash2 size={14} />
                      </button>
                  </div>
                </div>
              ))}
              {meetings.length === 0 && (
                <div className="p-4 text-center text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No sessions found
                </div>
              )}
            </div>
         </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 flex justify-between items-center shrink-0 z-10 lg:hidden">
           {/* Mobile header */}
           <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                aria-label="Toggle Menu"
              >
                <Menu size={20} />
              </button>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs font-black">C</div>
                 CSSA Hub
              </h1>
           </div>
           <button onClick={handleLogout} className="text-sm font-bold text-slate-500 hover:text-red-500 transition-colors">Sign Out</button>
        </header>
        <header className="px-8 py-4 flex justify-end items-center shrink-0 z-10 hidden lg:flex border-b border-slate-100 bg-white">
           <button 
             onClick={handleLogout}
             className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors bg-slate-50 hover:bg-slate-100 px-4 py-2 rounded-lg"
           >
             Sign Out
           </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
            {createFormVisible && (
              <div className="mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in-up">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                   <h3 className="font-semibold text-slate-800">Launch New Session</h3>
                   <button onClick={() => setCreateFormVisible(false)} className="text-slate-400 hover:text-slate-600 bg-white shadow-sm border border-slate-200 p-1 rounded-md"><X size={16} /></button>
                </div>
                <div className="p-6">
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    await handleCreateMeeting(e);
                    setCreateFormVisible(false);
                  }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-1 md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 mb-2">Session Title</label>
                       <input name="meetingTitle" placeholder="e.g Weekly Sync 01" required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                       <input name="date" type="date" required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Start Time</label>
                       <input name="startTime" type="time" required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Tolerance (Minutes)</label>
                       <input name="limit" type="number" defaultValue={15} required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
                    </div>
                    

                    <div className="col-span-1 md:col-span-2 flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                      <button type="button" onClick={() => setCreateFormVisible(false)} className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-xl transition-all">Cancel</button>
                      <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-medium transition-all shadow-sm flex items-center gap-2">
                        {loading && <RefreshCcw size={16} className="animate-spin" />} {loading ? 'Creating...' : 'Create Session'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {activeView === 'students' ? (
              <div className="space-y-6 animate-fade-in-up">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-slate-50/50">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Manajemen Mahasiswa</h2>
                      <p className="text-sm text-slate-500 mt-1">Kelola profil wajah dan pelatihan AI untuk mahasiswa.</p>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Cari nama atau divisi..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64 shadow-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="px-6 py-4 text-left">Nama Lengkap</th>
                          <th className="px-6 py-4 text-left">Divisi</th>
                          <th className="px-6 py-4 text-center">Sampel Wajah</th>
                          <th className="px-6 py-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allStudents
                          .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.division.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map((student) => {
                            const sampleCount = Array.isArray(student.face_descriptor[0]) 
                              ? (student.face_descriptor as any).length 
                              : 1;
                            
                            return (
                              <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                      <UserCircle size={20} />
                                    </div>
                                    <span className="font-semibold text-slate-800">{student.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-slate-500">{student.division}</td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                    sampleCount >= 10 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                    sampleCount >= 5 ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                    'bg-slate-50 text-slate-600 border border-slate-100'
                                  }`}>
                                    {sampleCount} Sampel
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <button
                                    onClick={() => {
                                      setTrainingStudent(student);
                                      setIsTrainingModalOpen(true);
                                      setError(null);
                                      setSuccess(false);
                                    }}
                                    className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-sm"
                                  >
                                    <Camera size={14} />
                                    Latih Wajah
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : selectedMeeting ? (
              <div className="space-y-6 md:space-y-8 animate-fade-in-up relative z-10">      
                {showSecurityDashboard ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[60vh]">
                     <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-red-50/30">
                        <div>
                          <h2 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2 md:gap-3">
                             <div className="p-2 bg-red-100 rounded-lg text-red-600"><ShieldAlert size={20} /></div>
                             Security Center
                          </h2>
                          <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 font-medium">
                             <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                             </span>
                             Active Threat Monitoring
                          </p>
                        </div>
                     </div>
                     <div className="p-6 md:p-8">
                       {securityLogs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                             <ShieldAlert size={48} className="mb-4 text-emerald-400 opacity-80" strokeWidth={1.5} />
                             <p className="font-semibold text-slate-600">System Secure</p>
                             <p className="text-sm mt-1">No intrusion attempts detected for this session.</p>
                          </div>
                       ) : (
                          <div className="space-y-4">
                             {securityLogs.map((log) => (
                                <div key={log.id} className="bg-white border border-slate-200 rounded-xl p-4 md:p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden group">
                                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-400 to-red-600 group-hover:w-1.5 transition-all"></div>
                                   <div>
                                      <div className="flex items-center gap-3 mb-1.5">
                                         <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold rounded-md uppercase tracking-wider">{log.threat_level || 'HIGH'}</span>
                                         <h3 className="text-slate-800 font-bold text-sm">{log.threat_type || 'Device Spoofing'}</h3>
                                      </div>
                                      <p className="text-slate-600 text-sm">
                                         <span className="font-bold text-slate-900">{log.name}</span> <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-xs">{log.division}</span> attempted unauthorized duplicate access.
                                      </p>
                                      <div className="mt-2.5 flex items-center gap-2">
                                        <span className="text-slate-500 text-[11px] uppercase font-semibold">Device Fingerprint:</span>
                                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded inline-block border border-slate-200 break-all">{log.device_id}</span>
                                      </div>
                                   </div>
                                   <div className="text-left md:text-right flex flex-col gap-1 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 mt-2 md:mt-0">
                                      <span className="text-slate-800 font-bold text-sm">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                      <span className="text-slate-500 text-xs font-medium">{format(new Date(log.timestamp), 'dd MMM yyyy')}</span>
                                   </div>
                                </div>
                             ))}
                          </div>
                       )}
                     </div>
                  </div>
                ) : (
                  <>
                   {/* Full Screen QR Modal */}
                   {showFullScreenQR && (
                      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-fade-in">
                         <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl flex flex-col items-center relative animate-zoom-in max-w-2xl w-full border border-slate-200">
                            <button onClick={() => setShowFullScreenQR(false)} className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors">
                              <X size={20} />
                            </button>
                            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-8 text-center">{selectedMeeting.title}</h2>
                            <div className="p-6 bg-white rounded-2xl shadow-sm border-2 border-slate-100">
                               <QRCodeSVG value={attendanceUrl} size={Math.min(300, 300)} level="H" />
                            </div>
                            <div className="mt-8 flex items-center gap-2 px-5 py-2.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                <RefreshCcw size={16} className="animate-spin-slow" /> Auto-refreshing Token
                            </div>
                         </div>
                      </div>
                   )}

                   <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                      {/* QR Card */}
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center flex-shrink-0 w-full xl:w-80">
                          <div className="bg-slate-50/50 p-5 rounded-2xl mb-6 w-full flex justify-center border-2 border-dashed border-slate-200 cursor-pointer group relative overflow-hidden transition-colors hover:bg-slate-50 hover:border-slate-300" onClick={() => setShowFullScreenQR(true)}>
                             <div className="bg-white p-3 rounded-xl shadow-sm transition-transform group-hover:scale-105 duration-300 border border-slate-100">
                                <QRCodeSVG value={attendanceUrl} size={150} level="M" />
                             </div>
                             <div className="absolute inset-0 bg-white/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <span className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg scale-90 group-hover:scale-100 transition-transform">
                                   <Maximize2 size={16} /> Expand
                                </span>
                             </div>
                          </div>
                          <div className="w-full">
                             <div className="grid grid-cols-2 gap-3">
                               <a
                                  href={attendanceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl transition-all font-medium text-sm shadow-sm"
                                >
                                  <QrCode size={16} className="text-slate-400" /> Open
                                </a>
                                <button
                                  onClick={() => refreshQRToken(selectedMeeting.id)}
                                  className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl transition-all font-medium text-sm shadow-sm"
                                >
                                  <RefreshCcw size={16} className="text-slate-400" /> Sync
                                </button>
                             </div>
                          </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
                          {[
                            { label: 'Present', val: stats.hadir, color: 'emerald', icon: CheckCircle },
                            { label: 'Late', val: stats.late, color: 'amber', icon: Clock },
                            { label: 'Excused', val: stats.izin + stats.sakit, color: 'blue', icon: ShieldAlert },
                            { label: 'Total', val: stats.total, color: 'slate', icon: Terminal },
                          ].map((stat, idx) => (
                             <div key={idx} className={`bg-white border border-slate-200 p-5 rounded-2xl flex flex-col shadow-sm relative overflow-hidden`}>
                                 <div className={`absolute right-0 top-0 p-4 opacity-[0.03] text-${stat.color}-600`}>
                                    <stat.icon size={64} />
                                 </div>
                                 <div className="flex items-center gap-3 mb-2 opacity-80">
                                    <div className={`w-2 h-2 rounded-full bg-${stat.color}-500`}></div>
                                    <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">{stat.label}</span>
                                 </div>
                                 <span className={`text-4xl font-black text-slate-800 tracking-tight mt-auto`}>{stat.val}</span>
                             </div>
                          ))}
                      </div>
                   </div>

                   {/* Main Table */}
                   <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="px-5 md:px-6 py-4 md:py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-slate-50/50">
                         <div>
                            <h2 className="text-lg font-bold text-slate-800">
                               {selectedMeeting.title}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs md:text-sm text-slate-500 mt-1.5 font-medium">
                               <span className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-sm"><Clock size={14} className="text-slate-400" /> {format(new Date(selectedMeeting.created_at), 'dd MMM yyyy')}</span>
                               <span className="px-2 py-1 bg-white border border-slate-200 rounded-md shadow-sm text-slate-600 font-bold">⏱ Tolerance: {selectedMeeting.attendance_limit_minutes}m</span>

                            </div>
                         </div>
                          <div className="flex gap-2">
                             <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm">
                                <Download size={14} /> CSV
                             </button>
                             <button onClick={handleExportPDF} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm">
                                <Download size={14} /> PDF
                             </button>
                          </div>
                      </div>

                      <div className="p-4 md:p-6 space-y-6">
                         {DIVISIONS.map(division => {
                            const divisionAttendees = attendances.filter(a => a.division === division);
                            if (divisionAttendees.length === 0) return null;
                            
                            return (
                               <div key={division} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                     <h3 className="font-bold text-slate-700 text-sm">{division}</h3>
                                     <span className="text-xs font-bold px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md shadow-sm">
                                        {divisionAttendees.length}
                                     </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                         <thead className="bg-slate-50/50">
                                            <tr>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">No</th>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Waktu</th>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Nama Lengkap</th>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Divisi</th>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-widest">Bukti</th>
                                              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Aksi</th>
                                            </tr>
                                         </thead>
                                         <tbody className="divide-y divide-slate-100">
                                            {divisionAttendees.map((record, idx) => (
                                               <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                                                  <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                                                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                                                     {format(new Date(record.timestamp), 'HH:mm')}
                                                  </td>
                                                  <td className="px-4 py-3 font-semibold text-slate-800">{record.name}</td>
                                                  <td className="px-4 py-3 text-slate-500 font-medium">{record.division}</td>
                                                  <td className={`px-4 py-3 text-sm font-bold ${
                                                      record.status === 'Late' ? 'text-amber-600' : 'text-emerald-600'
                                                  }`}>
                                                      <span className="flex items-center gap-1.5">
                                                         {record.status === 'Hadir' ? <CheckCircle size={14}/> : <Clock size={14}/>}
                                                         {record.status}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-3">
                                                     {record.photo_url ? (
                                                         <button 
                                                             onClick={() => setPreviewPhoto(record.photo_url)}
                                                             className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                                                             title="Lihat foto bukti"
                                                         >
                                                             <ImageIcon size={16} />
                                                             <span className="text-[10px] font-bold uppercase">Lihat Foto</span>
                                                         </button>
                                                     ) : (
                                                         <span className="text-slate-300 italic text-[10px]">Tanpa Foto</span>
                                                     )}
                                                  </td>
                                                  <td className="px-4 py-3 text-right">
                                                     <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                       <select
                                                         value={record.status}
                                                         onChange={(e) => updateStatus(record.id, e.target.value)}
                                                         className="text-xs bg-white border border-slate-200 rounded-md py-1 px-1.5 text-slate-600 focus:border-blue-500 hover:border-slate-300 outline-none cursor-pointer transition-colors shadow-sm font-medium"
                                                       >
                                                         <option value="Hadir">Hadir</option>
                                                         <option value="Late">Late</option>
                                                         <option value="Izin">Izin</option>
                                                         <option value="Sakit">Sakit</option>
                                                         <option value="Alfa">Alfa</option>
                                                       </select>
                                                       <button
                                                         onClick={() => deleteAttendance(record.id, record.name)}
                                                         className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                         title="Delete Record"
                                                       >
                                                         <Trash2 size={14} />
                                                       </button>
                                                     </div>
                                                  </td>
                                               </tr>
                                            ))}
                                         </tbody>
                                      </table>
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                    </div>
                   </>
                 )}
               </div>
            ) : (
               <div className="h-[70vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in-up">
                 <div className="w-20 h-20 bg-white border border-slate-200 shadow-sm text-slate-300 rounded-3xl flex items-center justify-center mb-6 transform -rotate-6">
                    <Terminal size={40} />
                 </div>
                 <h2 className="text-2xl font-bold text-slate-800">Pilih Sesi</h2>
                 <p className="text-slate-500 mt-2 max-w-sm text-sm leading-relaxed">Choose an active session from the sidebar to view attendance metrics or initialize a new monitoring session.</p>
               </div>
            )}
        </div>

        {/* Floating Latest Attendee Notification */}
        {latestAttendee && (
            <div className="fixed bottom-6 right-6 z-[60] animate-[slideIn_0.3s_ease-out]">
                <div className="bg-slate-900/90 backdrop-blur-xl border border-blue-500/50 p-4 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.5)] flex items-center gap-4 max-w-sm">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 shrink-0 overflow-hidden">
                        {latestAttendee.photo_url ? (
                            <img src={latestAttendee.photo_url} alt="Proof" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={24} />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Absensi Masuk</span>
                        </div>
                        <div className="font-bold text-white text-sm truncate">{latestAttendee.name}</div>
                        <div className="text-slate-400 text-[10px] uppercase font-medium">{latestAttendee.division} • {latestAttendee.status}</div>
                    </div>
                </div>
            </div>
        )}

        {/* Face Training Modal */}
        {isTrainingModalOpen && trainingStudent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <div className="bg-white max-w-md w-full rounded-3xl overflow-hidden shadow-2xl animate-zoom-in">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Latih Wajah</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Mahasiswa: {trainingStudent.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => !submitting && setIsTrainingModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8">
                {success ? (
                  <div className="text-center py-6 animate-fade-in">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle size={32} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800">Berhasil!</h4>
                    <p className="text-slate-500 text-sm mt-1">Sampel wajah berhasil ditambahkan ke profil {trainingStudent.name}.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                      <p className="text-xs text-blue-700 leading-relaxed font-medium">
                        Unggah foto wajah {trainingStudent.name} untuk meningkatkan akurasi pengenalan AI. Gunakan foto yang jelas dan menghadap ke depan.
                      </p>
                    </div>

                    {error && (
                      <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-2 text-red-600 animate-shake">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold">{error}</p>
                      </div>
                    )}

                    <input
                      type="file"
                      id="admin-photo-upload"
                      accept="image/*"
                      onChange={handleTrainingUpload}
                      className="hidden"
                      disabled={submitting}
                    />

                    <label
                      htmlFor="admin-photo-upload"
                      className={`w-full py-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${
                        submitting 
                          ? 'bg-slate-50 border-slate-200 cursor-not-allowed' 
                          : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={32} className="text-blue-500 animate-spin" />
                          <span className="text-sm font-bold text-slate-600">{trainingStatus}</span>
                        </>
                      ) : (
                        <>
                          <Upload size={32} className="text-slate-300" />
                          <div className="text-center">
                            <span className="text-sm font-bold text-slate-700 block">Pilih Foto</span>
                            <span className="text-[10px] text-slate-400">JPG, PNG atau WEBP</span>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsTrainingModalOpen(false)}
                  disabled={submitting}
                  className="px-6 py-2 text-slate-600 font-bold text-sm hover:text-slate-800 disabled:opacity-50"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Photo Preview Modal */}
        {previewPhoto && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in" onClick={() => setPreviewPhoto(null)}>
                <div className="relative max-w-2xl w-full bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="absolute top-4 right-4 z-10">
                        <button onClick={() => setPreviewPhoto(null)} className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="aspect-[4/3] bg-black">
                        <img src={previewPhoto} alt="Evidence" className="w-full h-full object-contain" />
                    </div>
                    <div className="p-6 border-t border-white/5 bg-slate-900/50 backdrop-blur-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                                <Camera size={20} />
                            </div>
                            <div>
                                <h4 className="text-white font-bold">Bukti Kehadiran</h4>
                                <p className="text-slate-400 text-[10px] uppercase tracking-widest">Diverifikasi via AI Wajah</p>
                            </div>
                        </div>
                        <a 
                            href={previewPhoto} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-4 py-2 rounded-xl transition shadow-lg shadow-blue-600/20"
                            onClick={e => e.stopPropagation()}
                        >
                            Buka File Asli
                        </a>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
