'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { PlusCircle, QrCode, RefreshCcw, Users, Clock, CheckCircle, AlertTriangle, Download, Lock, Maximize2, X, Trash2, MapPin, Archive, RotateCcw, Terminal, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

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

  // Simple Auth Check
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin123') { // Simple hardcoded password for MVP
      setIsAuthenticated(true);
      localStorage.setItem('cssa_admin_auth', 'true');
    } else {
      alert('Incorrect Password');
    }
  };

  useEffect(() => {
    const auth = localStorage.getItem('cssa_admin_auth');
    if (auth === 'true') setIsAuthenticated(true);
    fetchMeetings();
  }, [showArchived]); // Re-fetch on toggle

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
          (payload) => {
            setAttendances((prev) => [payload.new, ...prev]);
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
          (payload) => {
            setSecurityLogs((prev) => [payload.new, ...prev]);
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

  const updateStatus = async (attendanceId: string, newStatus: string) => {
    await supabase.from('attendance').update({ status: newStatus }).eq('id', attendanceId);
    if (selectedMeeting) fetchAttendance(selectedMeeting.id);
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
      <div className="min-h-screen flex items-center justify-center bg-black overflow-hidden relative font-mono text-green-500">
        <style>{`
          @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
          .scan-line { height: 2px; width: 100%; background: rgba(16,185,129,0.3); position: absolute; box-shadow: 0 0 10px #10B981; animation: slideDown 3s linear infinite; }
          .crt::before { content: " "; display: block; position: absolute; top: 0; left: 0; bottom: 0; right: 0; background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06)); z-index: 2; background-size: 100% 2px, 3px 100%; pointer-events: none; }
        `}</style>
        <div className="crt absolute inset-0"></div>
        <div className="scan-line top-0 z-10"></div>
        
        <form onSubmit={handleLogin} className="border border-green-500/50 bg-black/60 backdrop-blur-sm p-10 w-full max-w-lg relative z-20 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-green-500"></div>
          <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-green-500"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-green-500"></div>
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-green-500"></div>

          <p className="text-xs mb-6 uppercase tracking-widest opacity-70">Secured Node // BEM FILKOM</p>
          <h2 className="text-4xl font-bold mb-2 tracking-tighter">
            <span className="text-slate-400">&gt;</span> ROOT_ACCESS
            <span className="animate-pulse">_</span>
          </h2>
          <p className="text-[10px] mb-8 uppercase tracking-widest text-green-400">Initialize Authentication Sequence</p>
          
          <div className="space-y-6">
            <div className="relative group">
               <input
                  type="password"
                  placeholder="[ ENTER PASSPHRASE ]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-green-950/20 border border-green-500/30 text-green-400 p-4 focus:ring-1 focus:ring-green-400 focus:outline-none transition-all placeholder:text-green-800 text-center tracking-[0.5em] font-black"
                />
            </div>
            <button type="submit" className="w-full relative overflow-hidden bg-green-500/10 border border-green-500 text-green-400 hover:bg-green-500 hover:text-black font-bold p-4 transition-all duration-300 uppercase tracking-widest group">
               <span className="relative z-10 group-hover:block hidden">Accessing...</span>
               <span className="relative z-10 block group-hover:hidden">Override Override</span>
               {/* Glitch hover effect could be placed here if desired */}
            </button>
          </div>
          <div className="mt-8 text-[9px] uppercase tracking-widest flex justify-between text-green-700">
             <span>SYS.ID: 9811.2</span>
             <span>CONN: SECURE</span>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black font-mono text-green-500 flex selection:bg-green-500 selection:text-black">    
      {/* Sidebar Navigation */}
      <aside className="w-80 bg-[#050505] border-r border-green-500/20 h-screen sticky top-0 flex flex-col shadow-[4px_0_50px_rgba(16,185,129,0.05)] z-20 hidden lg:flex">
         <div className="p-8 border-b border-green-500/20 relative">
            <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-green-500/50 m-2"></div>
            <h1 className="text-2xl font-black text-green-400 tracking-tighter flex items-center gap-3 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">
              <div className="w-8 h-8 border-2 border-green-400 flex items-center justify-center text-green-400 text-lg relative bg-green-950/30">
                 <div className="absolute absolute inset-0 bg-green-400/20 animate-ping"></div>
                 C
              </div>
              CSSA NODE
            </h1>
            <p className="text-[10px] text-green-600 mt-3 font-bold tracking-[0.2em] uppercase">SYS.ATTENDANCE_MGT</p>
         </div>
         
         <div className="p-6 flex-1 overflow-y-auto custom-scrollbar relative z-10">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-[10px] font-bold text-green-700/80 uppercase tracking-widest font-mono">
                  &gt; {showArchived ? 'ARCHIVED' : 'ACTIVE'}_NODES
               </h3>
               <div className="flex gap-2">
                   <button 
                      onClick={() => setShowArchived(!showArchived)} 
                      className={`p-2 transition-colors border text-xs ${showArchived ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-black text-green-700/60 hover:text-green-400 hover:bg-green-950/20 border-green-900/30'}`}
                      title={showArchived ? "Show Active" : "Show Archived"}
                    >
                      {showArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                   </button>
                   {!showArchived && (
                       <button 
                          onClick={() => setCreateFormVisible(true)} 
                          className="bg-green-950/20 hover:bg-green-500/20 text-green-400 p-2 border border-green-500/30 transition-colors text-xs drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]"
                          title="Initialize New Session"
                        >
                          <PlusCircle size={18} />
                       </button>
                   )}
                   <button
                      onClick={() => setShowSecurityDashboard(!showSecurityDashboard)}
                      className={`p-2 transition-colors border text-xs ${showSecurityDashboard ? 'bg-red-500/20 text-red-500 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-black text-red-900/60 hover:text-red-500 hover:bg-red-950/20 border-red-900/30'}`}
                      title="Intrusion Logs"
                    >
                      <ShieldAlert size={18} className={showSecurityDashboard ? 'animate-pulse' : ''} />
                   </button>
               </div>
            </div>

            <div className="space-y-4 relative z-10 p-2">
               {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className={`group p-4 rounded-none transition-all border relative overflow-hidden flex flex-col crt ${
                    selectedMeeting?.id === meeting.id
                      ? 'bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] border-green-500 translate-x-2'
                      : 'bg-black hover:bg-green-950/40 border-green-500/30 hover:border-green-500/80'
                  }`}
                >
                  {selectedMeeting?.id === meeting.id && <div className="absolute top-0 right-0 w-2 h-2 bg-green-500 animate-pulse"></div>}
                  <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none group-hover:bg-green-500/10 -m-4 rotate-45 transition-colors"></div>
                  <div className="cursor-pointer" onClick={() => setSelectedMeeting(meeting)}>
                      <h4 className={`font-mono text-sm tracking-widest uppercase font-bold ${selectedMeeting?.id === meeting.id ? 'text-green-300 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]' : 'text-green-600'}`}>
                        {selectedMeeting?.id === meeting.id ? '> ' : ''}{meeting.title}
                      </h4>
                      <div className={`text-[10px] mt-2 flex justify-between items-center font-mono ${selectedMeeting?.id === meeting.id ? 'text-green-400/80' : 'text-green-700/60'}`}>
                        <span className="flex items-center gap-1 uppercase tracking-widest"><Users size={10}/> {meeting.date}</span>
                        <span className="bg-green-950/50 border border-green-500/30 px-2 py-0.5 tracking-wider">{meeting.start_time}</span>
                      </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className={`mt-3 pt-3 border-t ${selectedMeeting?.id === meeting.id ? 'border-green-500/30' : 'border-green-900/30'} flex justify-end gap-2`}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(meeting.id); }}
                        className={`text-[8px] uppercase font-bold px-2 py-1 flex items-center gap-1 transition-colors tracking-widest
                           ${selectedMeeting?.id === meeting.id 
                             ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40 border border-red-500/30' 
                             : 'bg-red-950/20 text-red-700 hover:text-red-500 hover:border-red-500/30 border border-transparent'}`}
                        title="Delete Permanently"
                      >
                         <Trash2 size={10} />
                         DEL
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleArchive(meeting.id, !meeting.is_archived); }}
                        className={`text-[8px] uppercase font-bold px-2 py-1 flex items-center gap-1 transition-colors tracking-widest
                           ${selectedMeeting?.id === meeting.id 
                             ? 'bg-green-950/50 text-green-400 hover:bg-green-900/60 border border-green-500/30' 
                             : 'bg-green-950/10 text-green-700 hover:text-green-500 hover:border-green-500/30 border border-transparent'}`}
                      >
                         {meeting.is_archived ? <RotateCcw size={10} /> : <Archive size={10} />}
                         {meeting.is_archived ? 'RSTR' : 'ARCH'}
                      </button>
                  </div>
                </div>
              ))}
              {meetings.length === 0 && (
                <div className="text-center p-8 border border-dashed border-green-500/30 bg-green-950/10">
                   <p className="text-green-700/60 text-xs font-mono uppercase tracking-widest mb-2">NO_SESSIONS_FOUND</p>
                   <button onClick={() => setCreateFormVisible(true)} className="text-green-500 text-[10px] font-bold tracking-[0.2em] uppercase hover:text-green-300 transition-colors drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]">[ INIT_NODE ]</button>
                </div>
              )}
            </div>
         </div>
         
         <div className="p-6 border-t border-green-500/20 bg-[#050505] relative z-10">
            <button onClick={() => {localStorage.removeItem('cssa_admin_auth'); setIsAuthenticated(false);}} className="flex items-center justify-center gap-3 text-[10px] font-bold text-red-500 hover:text-black transition-colors w-full p-3 border border-red-500/30 hover:bg-red-500 uppercase tracking-[0.2em]">
               <Lock size={16} /> Logout
            </button>
         </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-black relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,50,0,0.1)_0,black_100%)] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDIwMCwgMjAwLCAyMDAsIDAuMDYpIi8+Cjwvc3ZnPg==')] opacity-30 pointer-events-none mix-blend-screen"></div>

        <header className="px-8 py-6 bg-black/80 backdrop-blur-md border-b border-green-500/20 flex justify-between items-center sticky top-0 z-10 lg:hidden">
            <h1 className="font-bold text-green-500 tracking-widest uppercase">CSSA Admin</h1>
            <button onClick={() => setCreateFormVisible(true)} className="text-green-400 hover:text-green-300 transition-colors"><PlusCircle /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            {/* Create Modal */}
            {createFormVisible && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-[#050505] p-8 rounded-none border border-green-500/40 shadow-[0_0_30px_rgba(16,185,129,0.15)] w-full max-w-2xl transform transition-all scale-100 relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-500"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-500"></div>
                  <div className="flex justify-between items-center mb-6 border-b border-green-500/20 pb-4">
                     <h2 className="text-xl font-bold text-green-400 tracking-[0.2em] uppercase flex items-center gap-3">
                        <Terminal size={20} /> Initialize Session
                     </h2>
                     <button type="button" onClick={() => setCreateFormVisible(false)} className="text-green-600 hover:text-green-400 transition-colors">
                        <X size={24} />
                     </button>
                  </div>
                  <form onSubmit={handleCreateMeeting} className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="col-span-full">
                      <label className="block text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] mb-2">Session Identifier</label>
                      <input name="meetingTitle" placeholder="WEEKLY_SYNC_01" required className="w-full bg-black border border-green-800 p-3 text-green-400 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 outline-none transition uppercase placeholder:text-green-900/50" />
                    </div>
                    <div>
                       <label className="block text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] mb-2">Timestamp (Date)</label>
                       <input name="date" type="date" required className="w-full bg-black border border-green-800 p-3 text-green-400 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 outline-none transition relative z-20" style={{colorScheme: 'dark'}} />
                    </div>
                    <div>
                       <label className="block text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] mb-2">T-Zero (Time)</label>
                       <input name="startTime" type="time" required className="w-full bg-black border border-green-800 p-3 text-green-400 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 outline-none transition relative z-20" style={{colorScheme: 'dark'}} />
                    </div>
                    <div>
                       <label className="block text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] mb-2">Tolerance (Min)</label>
                       <input name="limit" type="number" defaultValue={15} required className="w-full bg-black border border-green-800 p-3 text-green-400 focus:border-green-400 focus:ring-1 focus:ring-green-400/50 outline-none transition" />
                    </div>
                    <div className="col-span-full flex justify-end gap-3 mt-4 pt-4 border-t border-green-500/20">
                      <button type="button" onClick={() => setCreateFormVisible(false)} className="px-6 py-3 text-green-700 font-bold hover:text-green-400 hover:bg-green-950/20 uppercase text-xs tracking-[0.2em] transition">Abort</button>
                      <button type="submit" disabled={loading} className="bg-green-600/20 border border-green-500 text-green-400 px-8 py-3 hover:bg-green-500 hover:text-black font-bold uppercase text-xs tracking-[0.2em] transition transform active:scale-95 group relative overflow-hidden">
                        <div className="absolute inset-0 w-0 bg-green-400 transition-all duration-300 ease-out group-hover:w-full -z-10"></div>
                        {loading ? 'Executing...' : 'Deploy Session'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {selectedMeeting ? (
              <div className="space-y-8 animate-fade-in-up relative z-10">
                {showSecurityDashboard ? (
                  <div className="bg-[#050505] rounded-none shadow-[0_0_30px_rgba(239,68,68,0.1)] border border-red-500/20 overflow-hidden relative min-h-[60vh]">
                     <div className="px-8 py-6 border-b border-red-500/40 flex justify-between items-center bg-red-950/20">
                        <div>
                          <h2 className="text-2xl font-black text-red-500 uppercase tracking-widest flex items-center gap-3">
                             <ShieldAlert className="animate-pulse" />
                             Intrusion Detection System
                          </h2>
                          <p className="text-[10px] text-red-400 mt-2 font-mono uppercase tracking-widest flex items-center gap-2">
                             <div className="w-2 h-2 bg-red-500 animate-ping"></div> Realtime Threat Monitoring Active
                          </p>
                        </div>
                     </div>
                     <div className="p-8">
                       {securityLogs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-green-500/50">
                             <CheckCircle size={48} className="mb-4 opacity-50" />
                             <p className="tracking-[0.3em] font-bold text-xs uppercase">System Secure. No threats detected.</p>
                          </div>
                       ) : (
                          <div className="space-y-4">
                             {securityLogs.map((log) => (
                                <div key={log.id} className="bg-red-950/10 border-l-4 border-red-500 p-4 flex flex-col md:flex-row justify-between md:items-center gap-4 relative overflow-hidden group hover:bg-red-900/20 transition-colors">
                                   <div className="absolute inset-0 bg-red-500/5 scan-line pointer-events-none opacity-0 group-hover:opacity-100"></div>
                                   <div>
                                      <div className="flex items-center gap-3 mb-2">
                                         <span className="px-2 py-0.5 bg-red-500 text-black text-[10px] font-black tracking-widest uppercase animate-pulse">{log.threat_level || 'HIGH'}</span>
                                         <h3 className="text-red-400 font-bold tracking-widest uppercase text-sm">{log.threat_type || 'DEVICE_SPOOFING'}</h3>
                                      </div>
                                      <p className="text-red-200/80 text-xs font-mono">
                                         <span className="text-white font-bold">{log.name}</span> ({log.division}) attempted unauthorized duplicate access.
                                      </p>
                                      <p className="text-red-500/60 text-[10px] font-mono mt-1">DEVICE_FINGERPRINT: {log.device_id}</p>
                                   </div>
                                   <div className="text-right flex flex-col md:items-end gap-1">
                                      <span className="text-red-400 font-mono text-xs">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                                      <span className="text-red-500/50 font-mono text-[10px]">{format(new Date(log.timestamp), 'dd MMM yyyy')}</span>
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in crt">
                       <button onClick={() => setShowFullScreenQR(false)} className="absolute top-6 right-6 p-3 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-none border border-green-500/50 transition group">
                          <X size={32} className="group-hover:rotate-90 transition-transform" />
                       </button>
                       <div className="bg-[#050505] p-12 rounded-none border-2 border-green-500/50 shadow-[0_0_50px_rgba(16,185,129,0.2)] flex flex-col items-center relative animate-zoom-in">
                          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 -translate-x-2 -translate-y-2"></div>
                          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 translate-x-2 translate-y-2"></div>
                          <h2 className="text-4xl font-black text-green-400 mb-2 tracking-[0.2em] text-center uppercase drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">{selectedMeeting.title}</h2>
                          <p className="text-green-600/80 mb-10 text-lg font-mono uppercase tracking-widest">&gt;&gt; AWAITING_SCAN_INPUT &lt;&lt;</p>
                          <div className="p-6 border border-green-500/30 bg-green-950/10 relative group">
                             <div className="absolute inset-0 bg-green-500/5 scan-line pointer-events-none"></div>
                             <div className="bg-white p-4">
                               <QRCodeSVG value={attendanceUrl} size={500} level="H" />
                             </div>
                          </div>
                          <div className="mt-10 flex items-center gap-3 px-6 py-3 border border-green-500/20 text-green-400 font-mono text-sm bg-green-950/20">
                             <div className="w-2 h-2 bg-green-500 animate-ping"></div>
                             DYNAMIC_QR_TOKEN_ENABLED : AUTO_REFRESH=300s
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="flex flex-col md:flex-row gap-6 items-start">
                    {/* QR Card */}
                    <div className="bg-[#050505] p-6 rounded-none shadow-[0_0_20px_rgba(16,185,129,0.05)] border border-green-500/20 flex flex-col items-center flex-shrink-0 w-full md:w-auto min-w-[300px] relative">
                        <div className="absolute top-0 right-0 w-2 h-2 bg-green-500 m-2 animate-pulse"></div>
                        <div className="bg-green-950/10 p-4 rounded-none mb-4 w-full flex justify-center border border-green-500/20 relative group cursor-pointer overflow-hidden" onClick={() => setShowFullScreenQR(true)}>
                           <div className="absolute inset-0 bg-green-500/5 scan-line pointer-events-none"></div>
                           <div className="bg-white p-2 transition-transform group-hover:scale-105 duration-300">
                             <QRCodeSVG value={attendanceUrl} size={220} level="M" />
                           </div>
                           <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                              <Maximize2 size={32} className="text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)] transform scale-50 group-hover:scale-100 transition-transform duration-300" />
                           </div>
                        </div>
                        <div className="w-full">
                           <h3 className="text-lg font-bold text-green-500 tracking-[0.2em] text-center mb-1 uppercase">Scan Protocol</h3>
                           <p className="text-[10px] text-center text-green-700 mb-4 tracking-widest uppercase">Auto-refresh: 300s</p>
                           <div className="grid grid-cols-2 gap-2">
                             <a 
                                href={attendanceUrl} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="flex items-center justify-center gap-2 bg-green-950/30 hover:bg-green-600 hover:text-black border border-green-500/30 text-green-400 px-4 py-2.5 transition font-bold text-[10px] tracking-wider uppercase"
                              >
                                <QrCode size={14} /> Link
                              </a>
                              <button 
                                onClick={() => refreshQRToken(selectedMeeting.id)}
                                className="flex items-center justify-center gap-2 bg-green-950/30 hover:bg-green-600 hover:text-black border border-green-500/30 text-green-400 px-4 py-2.5 transition font-bold text-[10px] tracking-wider uppercase"
                              >
                                <RefreshCcw size={14} /> Sync
                              </button>
                           </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="flex-1 w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Hadir', value: stats.hadir, color: 'text-green-400', bg: 'bg-green-950/20', border: 'border-green-500/30' },
                          { label: 'Late', value: stats.late, color: 'text-yellow-400', bg: 'bg-yellow-950/20', border: 'border-yellow-500/30' },
                          { label: 'Excused', value: stats.izin + stats.sakit, color: 'text-blue-400', bg: 'bg-blue-950/20', border: 'border-blue-500/30' },
                          { label: 'Total', value: stats.total, color: 'text-white/80', bg: 'bg-white/5', border: 'border-white/10' },
                        ].map((stat, idx) => (
                           <div key={idx} className={`${stat.bg} ${stat.border} border p-6 rounded-none flex flex-col justify-between items-start shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-1 relative overflow-hidden group`}>
                              <div className={`absolute top-0 right-0 w-8 h-8 ${stat.bg} ${stat.border} border-b border-l transform translate-x-4 -translate-y-4 rotate-45 group-hover:bg-current transition-colors opacity-20`}></div>
                              <span className={`text-4xl font-black ${stat.color} tracking-tighter drop-shadow-[0_0_8px_currentColor]`}>{stat.value}</span>
                              <span className={`text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 ${stat.color} mt-2`}>{stat.label}</span>
                           </div>
                        ))}
                    </div>
                 </div>

                 {/* Main Table */}
                 <div className="bg-[#050505] rounded-none shadow-[0_0_30px_rgba(16,185,129,0.05)] border border-green-500/20 overflow-hidden relative">
                    <div className="px-8 py-6 border-b border-green-500/20 flex justify-between items-end bg-green-950/10">
                       <div>
                          <h2 className="text-xl font-bold text-green-400 uppercase tracking-widest flex items-center gap-3">
                             <div className="w-2 h-2 bg-green-500 animate-pulse"></div>
                             {selectedMeeting.title}
                          </h2>
                          <div className="flex items-center gap-4 text-[10px] text-green-600 mt-2 font-mono uppercase tracking-widest">
                             <span className="flex items-center gap-1"><Clock size={12}/> {format(new Date(selectedMeeting.created_at), 'dd MMM yyyy')}</span>
                             <span className="px-2 py-0.5 bg-green-950/40 border border-green-500/20 text-green-500">TOLERANCE: {selectedMeeting.attendance_limit_minutes}m</span>
                          </div>
                       </div>
                       <button onClick={handleExportCSV} className="flex items-center gap-2 bg-green-600/20 border border-green-500 hover:bg-green-500 text-green-400 hover:text-black px-5 py-2.5 text-xs tracking-widest font-bold transition transform active:scale-95 uppercase">
                          <Download size={14} /> EXPORT_DAT
                       </button>
                    </div>

                    <div className="p-8 space-y-8 bg-black/50">
                       {DIVISIONS.map(division => {
                          const divisionAttendees = attendances.filter(a => a.division === division);
                          return (
                             <div key={division} className="bg-black/40 border border-green-500/10 overflow-hidden hover:border-green-500/30 transition-colors duration-300 relative group">
                                <div className="px-6 py-3 bg-green-950/20 border-b border-green-500/10 flex justify-between items-center relative overflow-hidden">
                                   <div className="absolute inset-0 bg-green-500/5 scan-line pointer-events-none opacity-0 group-hover:opacity-100"></div>
                                   <div className="flex items-center gap-3 relative z-10">
                                      <div className={`w-2 h-2 ${divisionAttendees.length > 0 ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-green-900'}`}></div>
                                      <h3 className="font-bold text-green-400 text-xs tracking-widest uppercase">{division}</h3>
                                   </div>
                                   <span className={`text-[10px] font-bold px-2 py-0.5 border ${divisionAttendees.length > 0 ? 'bg-green-900/40 border-green-500/50 text-green-400' : 'bg-green-950/10 border-green-900/50 text-green-800'} relative z-10 tracking-widest`}>
                                      {divisionAttendees.length}
                                   </span>
                                </div>
                                {divisionAttendees.length > 0 ? (
                                   <table className="w-full text-xs font-mono">
                                      <thead className="bg-[#0a0a0a] text-green-700/80 tracking-widest uppercase border-b border-green-500/10">
                                         <tr>
                                            <th className="px-6 py-4 font-normal text-left w-16">IDX</th>
                                            <th className="px-6 py-4 font-normal text-left">TIMESTAMP</th>
                                            <th className="px-6 py-4 font-normal text-left">OPERATIVE</th>
                                            <th className="px-6 py-4 font-normal text-center">STATE</th>
                                            <th className="px-6 py-4 font-normal text-right">OVERRIDE</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-green-500/5">
                                         {divisionAttendees.map((record, index) => (
                                            <tr key={record.id} className="hover:bg-green-500/5 transition-colors group">
                                               <td className="px-6 py-3 text-green-700/50">{(index + 1).toString().padStart(3, '0')}</td>
                                               <td className="px-6 py-3 text-green-600/80 flex items-center gap-2">
                                                  {format(new Date(record.timestamp), 'HH:mm')}
                                                  <span className="text-[10px] text-green-800">:{format(new Date(record.timestamp), 'ss')}</span>
                                               </td>
                                               <td className="px-6 py-3 font-bold text-green-400 group-hover:text-green-300 uppercase tracking-wider">{record.name}</td>
                                               <td className="px-6 py-3 text-center">
                                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase font-bold tracking-widest border ${getStatusColor(record.status)}`}>
                                                     {record.status === 'Hadir' && <CheckCircle size={10} />}
                                                     {record.status === 'Late' && <div className="w-2 h-2 bg-yellow-500 animate-pulse"></div>}
                                                     {record.status}
                                                  </span>
                                               </td>
                                               <td className="px-6 py-3 text-right">
                                                  <div className="flex items-center justify-end gap-2">
                                                    <select 
                                                      value={record.status}
                                                      onChange={(e) => updateStatus(record.id, e.target.value)}
                                                      className="text-[10px] uppercase tracking-widest bg-black border border-green-500/20 py-1 px-2 text-green-400 focus:border-green-400 outline-none cursor-pointer hover:border-green-500/50 transition-colors"
                                                    >
                                                      <option value="Hadir" className="bg-black text-green-400">Hadir</option>
                                                      <option value="Late" className="bg-black text-yellow-400">Late</option>
                                                      <option value="Izin" className="bg-black text-blue-400">Izin</option>
                                                      <option value="Sakit" className="bg-black text-purple-400">Sakit</option>
                                                      <option value="Alfa" className="bg-black text-red-500">Alfa</option>
                                                    </select>
                                                    <button 
                                                      onClick={() => deleteAttendance(record.id, record.name)}
                                                      className="p-1.5 text-green-600 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                      title="TERMINATE_RECORD"
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  </div>
                                               </td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                ) : (
                                   <div className="p-4 text-center text-green-700/50 text-[10px] tracking-widest uppercase bg-black/40 border-t border-green-500/5 crt">
                                      NO_DATA_LINK_DETECTED_FOR_{division.toUpperCase()}
                                   </div>
                                )}
                             </div>
                          );
                       })}
                    </div>
                 </div>
              </>
              )}
            </div>
            ) : (
               <div className="h-[80vh] flex flex-col items-center justify-center text-center opacity-60">
                 <div className="bg-green-950/20 border border-green-500/20 p-8 mb-6 animate-pulse crt">
                    <Terminal size={48} className="text-green-500" />
                 </div>
                 <h2 className="text-xl font-bold text-green-500 uppercase tracking-[0.2em]">Awaiting Input</h2>
                 <p className="text-green-700/80 mt-2 max-w-xs text-xs tracking-widest font-mono uppercase">Select a session from the node list to monitor datastream.</p>
               </div>
            )}
        </div>

        {/* Realtime Sci-Fi Notification Popup */}
        {latestAttendee && (
          <div className="fixed top-8 right-8 z-50 animate-[slideInRight_0.5s_ease-out]">
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes scanGlow {
                0%, 100% { box-shadow: 0 0 10px rgba(16,185,129,0.3); }
                50% { box-shadow: 0 0 20px rgba(16,185,129,0.8), inset 0 0 10px rgba(16,185,129,0.2); }
              }
            `}</style>
            <div className="bg-[#050505] border border-green-500 p-4 rounded-none shadow-[0_0_30px_rgba(16,185,129,0.2)] flex items-center gap-4 animate-[scanGlow_2s_infinite] min-w-[300px] relative">
              <div className="absolute top-0 right-0 w-2 h-2 bg-green-400"></div>
              <div className="w-12 h-12 rounded-none border-2 border-green-400 border-dashed animate-[spin_4s_linear_infinite] flex items-center justify-center relative">
                <div className="absolute inset-0 bg-green-500/20 animate-pulse"></div>
                <div className="w-2 h-2 bg-green-400"></div>
              </div>
              <div>
                <p className="text-green-400 text-[10px] font-black tracking-widest uppercase mb-0.5 flex items-center gap-1">
                  <CheckCircle size={10} /> DATA_LINK_ESTABLISHED
                </p>
                <p className="text-green-100 font-bold text-lg leading-tight uppercase truncate max-w-[200px] font-mono">{latestAttendee.name}</p>
                <div className="flex gap-2 items-center mt-1">
                  <span className="text-[10px] bg-green-950/50 border border-green-500/30 text-green-400 px-2 py-0.5 tracking-widest uppercase">{latestAttendee.division}</span>
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${latestAttendee.status === 'Late' ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]' : 'text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.8)]'}`}>
                    [{latestAttendee.status}]
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
