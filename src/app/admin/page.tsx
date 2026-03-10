'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { PlusCircle, QrCode, RefreshCcw, Users, Clock, CheckCircle, AlertTriangle, Download, Lock, Maximize2, X, Trash2, MapPin } from 'lucide-react';
import { format } from 'date-fns';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false, loading: () => <p>Loading Map...</p> });

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
  const [newMeetingLoc, setNewMeetingLoc] = useState({ lat: -7.9525, lng: 112.6145 });

  const handleGetCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(function(position) {
        setNewMeetingLoc({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }, function(error) {
         alert("Error getting location: " + error.message);
      });
    } else {
      alert("Geolocation is not available");
    }
  };

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
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    let interval: NodeJS.Timeout;
    if (selectedMeeting) {
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
          }
        )
        .subscribe();

      // Refresh QR every 60s
      interval = setInterval(() => {
        refreshQRToken(selectedMeeting.id);
      }, 60000);

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [selectedMeeting, isAuthenticated]);

  const fetchMeetings = async () => {
    const { data } = await supabase.from('meetings').select('*').order('created_at', { ascending: false });
    if (data) setMeetings(data);
  };

  const fetchAttendance = async (meetingId: string) => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('timestamp', { ascending: false });
    
    if (data) setAttendances(data);
  };

  const refreshQRToken = async (meetingId: string) => {
    const newToken = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60000 * 2); // Valid for 2 minutes to allow overlap.
    
    await supabase.from('meetings').update({ 
      qr_token: newToken, 
      qr_expiry: expiry.toISOString() 
    }).eq('id', meetingId);
    
    setQrToken(newToken);
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
      latitude: parseFloat(form.latitude.value),
      longitude: parseFloat(form.longitude.value),
      radius_meters: parseInt(form.radius.value),
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
      case 'Hadir': return 'bg-green-100 text-green-800';
      case 'Late': return 'bg-yellow-100 text-yellow-800';
      case 'Izin': return 'bg-blue-100 text-blue-800';
      case 'Sakit': return 'bg-purple-100 text-purple-800';
      case 'Alfa': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
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
      <div className="min-h-screen flex items-center justify-center bg-slate-900 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-slate-900"></div>
        <form onSubmit={handleLogin} className="bg-white/5 backdrop-blur-xl p-10 rounded-2xl shadow-2xl border border-white/10 w-full max-w-sm relative z-10 animate-fade-in-up">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-600/20 p-4 rounded-full ring-1 ring-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
              <Lock className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-center mb-2 text-white tracking-tight">Admin Portal</h2>
          <p className="text-slate-400 text-center text-sm mb-8">Restricted Access Authorization</p>
          
          <div className="space-y-4">
            <div className="relative group">
               <input 
                  type="password" 
                  placeholder="Enter Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 group-hover:border-blue-500/30 text-center tracking-widest"
                />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold p-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]">
              Authenticate
            </button>
          </div>
          <p className="text-[10px] text-center text-slate-600 mt-6 uppercase tracking-widest">Authorized Personnel Only</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex">
      {/* Sidebar Navigation */}
      <aside className="w-80 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 hidden lg:flex">
         <div className="p-8 border-b border-slate-100">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">C</div>
              CSSA Admin
            </h1>
            <p className="text-xs text-slate-400 mt-2 font-medium tracking-wide uppercase">Attendance Management</p>
         </div>
         
         <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Meetings</h3>
               <button 
                  onClick={() => setCreateFormVisible(true)} 
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-2 rounded-lg transition-colors border border-blue-200"
                  title="Create Meeting"
                >
                  <PlusCircle size={18} />
               </button>
            </div>
            
            <div className="space-y-3">
              {meetings.map((meeting) => (
                <div 
                  key={meeting.id}
                  onClick={() => setSelectedMeeting(meeting)}
                  className={`group p-4 rounded-xl cursor-pointer transition-all border relative overflow-hidden
                    ${selectedMeeting?.id === meeting.id 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border-blue-500 translate-x-2' 
                      : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                  <h4 className={`font-semibold ${selectedMeeting?.id === meeting.id ? 'text-white' : 'text-slate-700'}`}>{meeting.title}</h4>
                  <div className={`text-xs mt-2 flex justify-between items-center ${selectedMeeting?.id === meeting.id ? 'text-blue-100' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1"><Users size={12}/> {meeting.date}</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">{meeting.start_time}</span>
                  </div>
                </div>
              ))}
              {meetings.length === 0 && (
                <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl">
                   <p className="text-slate-400 text-sm">No meetings yet.</p>
                   <button onClick={() => setCreateFormVisible(true)} className="text-blue-500 text-xs font-bold mt-2 hover:underline">Create one</button>
                </div>
              )}
            </div>
         </div>
         
         <div className="p-6 border-t border-slate-100 bg-slate-50/50">
            <button onClick={() => {localStorage.removeItem('cssa_admin_auth'); setIsAuthenticated(false);}} className="flex items-center gap-3 text-sm font-medium text-slate-500 hover:text-red-600 transition-colors w-full p-2 rounded-lg hover:bg-red-50">
               <Lock size={16} /> Logout
            </button>
         </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-slate-50/50">
        <header className="px-8 py-6 bg-white/80 backdrop-blur-md border-b border-slate-200 flex justify-between items-center sticky top-0 z-10 lg:hidden">
            <h1 className="font-bold text-slate-800">CSSA Admin</h1>
            <button onClick={() => setCreateFormVisible(true)} className="text-blue-600"><PlusCircle /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            {/* Create Modal */}
            {createFormVisible && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-2xl transform transition-all scale-100 border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                     <h2 className="text-2xl font-bold text-slate-800">New Meeting</h2>
                     <button onClick={() => setCreateFormVisible(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                  </div>
                  <form onSubmit={handleCreateMeeting} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-full">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Title</label>
                      <input name="meetingTitle" placeholder="Weekly Meeting" required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                       <input name="date" type="date" required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Start Time</label>
                       <input name="startTime" type="time" required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Late Limit (min)</label>
                       <input name="limit" type="number" defaultValue={15} required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Latitude</label>
                       <div className="relative">
                           <input 
                              name="latitude" 
                              type="number" 
                              step="any" 
                              value={newMeetingLoc.lat}
                              onChange={(e) => setNewMeetingLoc({...newMeetingLoc, lat: parseFloat(e.target.value)})} 
                              required 
                              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" 
                            />
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Longitude</label>
                       <div className="relative">
                           <input 
                              name="longitude" 
                              type="number" 
                              step="any" 
                              value={newMeetingLoc.lng}
                              onChange={(e) => setNewMeetingLoc({...newMeetingLoc, lng: parseFloat(e.target.value)})} 
                              required 
                              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" 
                            />
                       </div>
                    </div>
                    <div className="col-span-full space-y-3">
                       <div className="flex gap-2">
                           <button 
                             type="button" 
                             onClick={handleGetCurrentLocation}
                             className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors border border-blue-200 w-fit"
                           >
                             <MapPin size={14} /> My Location
                           </button>
                           <span className="text-xs text-slate-400 py-2">Click map to adjust pin</span>
                       </div>
                       
                       <MapPicker 
                          lat={newMeetingLoc.lat} 
                          lng={newMeetingLoc.lng} 
                          onChange={(pos) => setNewMeetingLoc(pos)} 
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Radius (Meters)</label>
                       <input name="radius" type="number" defaultValue="100" required className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 ring-blue-500 outline-none transition" />
                    </div>
                    <div className="col-span-full flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                      <button type="button" onClick={() => setCreateFormVisible(false)} className="px-6 py-3 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition">Cancel</button>
                      <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-500/20 transition transform active:scale-95">
                        {loading ? 'Creating...' : 'Create Meeting'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {selectedMeeting ? (
              <div className="space-y-8 animate-fade-in-up">
                 {/* Full Screen QR Modal */}
                 {showFullScreenQR && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4 animate-fade-in">
                       <button onClick={() => setShowFullScreenQR(false)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition backdrop-blur-sm group">
                          <X size={32} className="text-white group-hover:rotate-90 transition-transform" />
                       </button>
                       <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center relative animate-zoom-in">
                          <h2 className="text-4xl font-bold text-slate-800 mb-2 tracking-tight text-center">{selectedMeeting.title}</h2>
                          <p className="text-slate-500 mb-10 text-lg font-medium">Please scan this QR code to attend</p>
                          <div className="p-6 rounded-3xl border-4 border-slate-100 shadow-inner bg-slate-50">
                             <QRCodeSVG value={attendanceUrl} size={500} level="H" className="mix-blend-multiply" />
                          </div>
                          <div className="mt-10 flex items-center gap-3 px-6 py-3 bg-blue-50 text-blue-700 rounded-full font-semibold text-sm">
                             <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                             Token refreshes automatically every 60s
                          </div>
                       </div>
                    </div>
                 )}

                 <div className="flex flex-col md:flex-row gap-6 items-start">
                    {/* QR Card */}
                    <div className="bg-white p-6 rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col items-center flex-shrink-0 w-full md:w-auto min-w-[300px]">
                        <div className="bg-blue-50 p-4 rounded-xl mb-4 w-full flex justify-center border border-blue-100 relative group cursor-pointer" onClick={() => setShowFullScreenQR(true)}>
                           <QRCodeSVG value={attendanceUrl} size={220} level="M" className="mix-blend-multiply opacity-90 transition-transform group-hover:scale-105 duration-300" />
                           <div className="absolute inset-0 flex items-center justify-center bg-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[1px]">
                              <Maximize2 size={32} className="text-blue-600 drop-shadow-sm transform scale-50 group-hover:scale-100 transition-transform duration-300" />
                           </div>
                        </div>
                        <div className="w-full">
                           <h3 className="text-lg font-bold text-slate-800 text-center mb-1">Scan for Attendance</h3>
                           <p className="text-xs text-center text-slate-400 mb-4">Auto-refreshes every 60s</p>
                           <div className="grid grid-cols-2 gap-2">
                             <a 
                                href={attendanceUrl} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg transition font-semibold text-xs"
                              >
                                <QrCode size={14} /> Open Link
                              </a>
                              <button 
                                onClick={() => refreshQRToken(selectedMeeting.id)}
                                className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-4 py-2.5 rounded-lg transition font-semibold text-xs"
                              >
                                <RefreshCcw size={14} /> Refresh
                              </button>
                           </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="flex-1 w-full grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          { label: 'Hadir', value: stats.hadir, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                          { label: 'Late', value: stats.late, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100' },
                          { label: 'Excused', value: stats.izin + stats.sakit, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                          { label: 'Total', value: stats.total, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
                        ].map((stat, idx) => (
                           <div key={idx} className={`${stat.bg} ${stat.border} border p-6 rounded-2xl flex flex-col justify-between items-start shadow-sm transition-transform hover:-translate-y-1`}>
                              <span className={`text-4xl font-extrabold ${stat.color} tracking-tighter`}>{stat.value}</span>
                              <span className={`text-xs font-bold uppercase tracking-widest opacity-60 ${stat.color}`}>{stat.label}</span>
                           </div>
                        ))}
                    </div>
                 </div>

                 {/* Main Table */}
                 <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-end bg-slate-50/30">
                       <div>
                          <h2 className="text-xl font-bold text-slate-800">{selectedMeeting.title}</h2>
                          <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                             <span className="flex items-center gap-1"><Clock size={12}/> {format(new Date(selectedMeeting.created_at), 'dd MMM yyyy')}</span>
                             <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">Limit: {selectedMeeting.attendance_limit_minutes}m</span>
                          </div>
                       </div>
                       <button onClick={handleExportCSV} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow-lg shadow-green-500/20 text-sm font-bold transition transform active:scale-95">
                          <Download size={16} /> Export CSV
                       </button>
                    </div>

                    <div className="p-8 space-y-8 bg-slate-50/30">
                       {DIVISIONS.map(division => {
                          const divisionAttendees = attendances.filter(a => a.division === division);
                          return (
                             <div key={division} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
                                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                   <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${divisionAttendees.length > 0 ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
                                      <h3 className="font-bold text-slate-700 text-sm">{division}</h3>
                                   </div>
                                   <span className={`text-xs font-bold px-2 py-1 rounded ${divisionAttendees.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                                      {divisionAttendees.length}
                                   </span>
                                </div>
                                {divisionAttendees.length > 0 ? (
                                   <table className="w-full text-sm">
                                      <thead className="bg-white text-slate-400 font-semibold text-[10px] uppercase tracking-wider border-b border-slate-50">
                                         <tr>
                                            <th className="px-6 py-3 text-left w-16">No</th>
                                            <th className="px-6 py-3 text-left">Time</th>
                                            <th className="px-6 py-3 text-left">Name</th>
                                            <th className="px-6 py-3 text-center">Status</th>
                                            <th className="px-6 py-3 text-right">Action</th>
                                         </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                         {divisionAttendees.map((record, index) => (
                                            <tr key={record.id} className="hover:bg-blue-50/50 transition-colors">
                                               <td className="px-6 py-3 text-slate-400 font-mono text-xs">{index + 1}</td>
                                               <td className="px-6 py-3 text-slate-500 font-mono text-xs flex items-center gap-2">
                                                  {format(new Date(record.timestamp), 'HH:mm')}
                                                  <span className="text-[10px] text-slate-300">:{format(new Date(record.timestamp), 'ss')}</span>
                                               </td>
                                               <td className="px-6 py-3 font-semibold text-slate-700">{record.name}</td>
                                               <td className="px-6 py-3 text-center">
                                                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wide ${getStatusColor(record.status)}`}>
                                                     {record.status === 'Hadir' && <CheckCircle size={10} />}
                                                     {record.status === 'Late' && <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>}
                                                     {record.status}
                                                  </span>
                                               </td>
                                               <td className="px-6 py-3 text-right">
                                                  <div className="flex items-center justify-end gap-2">
                                                    <select 
                                                      value={record.status}
                                                      onChange={(e) => updateStatus(record.id, e.target.value)}
                                                      className="text-xs bg-white border border-slate-200 rounded-md py-1 px-2 text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer hover:border-blue-300 transition-colors"
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
                                                      title="Delete Member"
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
                                   <div className="p-4 text-center text-slate-300 text-xs italic bg-slate-50/50">
                                      No members from {division} checked in yet.
                                   </div>
                                )}
                             </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
            ) : (
               <div className="h-[80vh] flex flex-col items-center justify-center text-center opacity-60">
                 <div className="bg-slate-100 p-8 rounded-full mb-6 animate-pulse">
                    <QrCode size={48} className="text-slate-400" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-700">No Meeting Selected</h2>
                 <p className="text-slate-400 mt-2 max-w-xs">Select a meeting from the sidebar to view live attendance or start a new one.</p>
               </div>
            )}
        </div>
      </main>
    </div>
  );
}
