'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Calendar, CheckCircle, Clock, XCircle, HelpCircle, Trophy, ArrowLeft, TrendingUp, BarChart3, Edit2, Save, X } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface AttendanceRecord {
  id: string;
  meeting_id: string;
  name: string;
  division: string;
  status: string;
  timestamp: string;
  meetings: {
    title: string;
    date: string;
  };
}

interface UserProfile {
  name: string;
  division: string;
  totalHadir: number;
  totalLate: number;
  totalIzin: number;
  totalSakit: number;
  totalAlfa: number;
  totalPresence: number;
  attendanceRate: number;
  points: number;
}

const COLORS = {
  Hadir: '#22c55e',
  Late: '#eab308',
  Izin: '#3b82f6',
  Sakit: '#a855f7',
  Alfa: '#ef4444'
};

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [searchName, setSearchName] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDivision, setEditDivision] = useState('');
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    // Check if name is stored in localStorage
    const savedName = localStorage.getItem('cssa_user_name');
    if (savedName) {
      setSearchName(savedName);
      fetchProfileData(savedName);
    } else {
      setShowSearch(true);
    }
  }, []);

  const fetchProfileData = async (name: string) => {
    setLoading(true);
    try {
      // Fetch attendance records
      const { data: attendances, error } = await supabase
        .from('attendance')
        .select(`
          *,
          meetings (
            title,
            date
          )
        `)
        .ilike('name', name)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      if (attendances && attendances.length > 0) {
        localStorage.setItem('cssa_user_name', name);
        
        // Calculate stats
        const stats = {
          name: attendances[0].name,
          division: attendances[0].division,
          totalHadir: attendances.filter(a => a.status === 'Hadir').length,
          totalLate: attendances.filter(a => a.status === 'Late').length,
          totalIzin: attendances.filter(a => a.status === 'Izin').length,
          totalSakit: attendances.filter(a => a.status === 'Sakit').length,
          totalAlfa: attendances.filter(a => a.status === 'Alfa').length,
          totalPresence: attendances.filter(a => ['Hadir', 'Late'].includes(a.status)).length,
          attendanceRate: 0,
          points: 0
        };

        const totalMeetings = attendances.length;
        stats.attendanceRate = totalMeetings > 0 
          ? Math.round((stats.totalHadir / totalMeetings) * 100) 
          : 0;
        
        stats.points = (stats.totalHadir * 10) + (stats.totalLate * 5);

        setProfile(stats);
        setAttendanceHistory(attendances);
      } else {
        setProfile(null);
        setAttendanceHistory([]);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchName.trim()) {
      fetchProfileData(searchName.trim());
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cssa_user_name');
    setSearchName('');
    setProfile(null);
    setAttendanceHistory([]);
    setShowSearch(true);
    setIsEditing(false);
  };

  const handleUpdateProfile = async () => {
    if (!editDivision || !profile) return;

    setUpdating(true);
    setMessage(null);

    try {
      // Update user_profiles table
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ division: editDivision })
        .eq('name', profile.name);

      if (profileError) throw profileError;

      // Update attendance records for consistency
      const { error: attendanceError } = await supabase
        .from('attendance')
        .update({ division: editDivision })
        .eq('name', profile.name);

      if (attendanceError) throw attendanceError;

      // Update absence requests for consistency
      const { error: absenceError } = await supabase
        .from('absence_requests')
        .update({ division: editDivision })
        .eq('name', profile.name);

      if (absenceError) throw absenceError;

      // Update local state
      setProfile({ ...profile, division: editDivision });
      localStorage.setItem('cssa_user_name', profile.name);
      
      // Refresh the attendance history to reflect division changes
      await fetchProfileData(profile.name);
      
      setMessage({ type: 'success', text: 'Profile updated successfully! All records have been updated.' });
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setMessage({ type: 'error', text: 'Failed to update profile: ' + err.message });
    } finally {
      setUpdating(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const startEditing = () => {
    if (profile) {
      setEditDivision(profile.division);
      setIsEditing(true);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Hadir': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'Late': return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'Izin': return <HelpCircle className="w-5 h-5 text-blue-500" />;
      case 'Sakit': return <HelpCircle className="w-5 h-5 text-purple-500" />;
      case 'Alfa': return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <HelpCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const chartData = [
    { name: 'Hadir', value: profile?.totalHadir || 0 },
    { name: 'Late', value: profile?.totalLate || 0 },
    { name: 'Izin', value: profile?.totalIzin || 0 },
    { name: 'Sakit', value: profile?.totalSakit || 0 },
    { name: 'Alfa', value: profile?.totalAlfa || 0 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 md:p-8">
      {/* Background Ambience */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
            Back to Home
          </Link>
          {profile && (
            <button
              onClick={handleLogout}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Change Account
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        ) : showSearch || !profile ? (
          /* Search Form */
          <div className="max-w-md mx-auto bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10">
            <div className="text-center mb-6">
              <div className="inline-block p-4 rounded-full bg-blue-500/10 mb-4 ring-1 ring-blue-400/30">
                <User className="text-blue-400 w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold mb-2">View Your Profile</h1>
              <p className="text-slate-400">Enter your name to see attendance history</p>
            </div>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Enter your registered name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                View Profile
              </button>
            </form>
          </div>
        ) : (
          /* Profile Dashboard */
          <div className="space-y-6">
            {/* Profile Card */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 md:p-8 border border-white/10">
              <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl font-bold shadow-lg">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-center md:text-left flex-1">
                  <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                    <h1 className="text-3xl font-bold">{profile.name}</h1>
                    <button
                      onClick={startEditing}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                      title="Edit Profile"
                    >
                      <Edit2 className="w-4 h-4 text-blue-400" />
                    </button>
                  </div>
                  <p className="text-slate-400 text-lg">{profile.division}</p>
                  <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span className="text-yellow-400 font-semibold">{profile.points} points</span>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                  message.type === 'success'
                    ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                    : 'bg-red-500/20 border border-red-500/30 text-red-400'
                }`}>
                  {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Edit Form Modal */}
              {isEditing && (
                <div className="mt-6 p-6 bg-white/5 rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Edit Profile</h3>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profile.name}
                        disabled
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed"
                      />
                      <p className="text-xs text-slate-500 mt-1">Name cannot be changed. Contact admin if needed.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Division *
                      </label>
                      <select
                        value={editDivision}
                        onChange={(e) => setEditDivision(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      >
                        <option value="">Select division</option>
                        {DIVISIONS.map((div) => (
                          <option key={div} value={div}>{div}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleUpdateProfile}
                        disabled={updating || !editDivision}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        <Save className="w-5 h-5" />
                        {updating ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-6 bg-white/10 hover:bg-white/20 text-white font-medium py-3 rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <span className="text-slate-400 text-sm">Hadir</span>
                  </div>
                  <p className="text-3xl font-bold text-green-400">{profile.totalHadir}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-6 h-6 text-yellow-500" />
                    <span className="text-slate-400 text-sm">Late</span>
                  </div>
                  <p className="text-3xl font-bold text-yellow-400">{profile.totalLate}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <HelpCircle className="w-6 h-6 text-blue-500" />
                    <span className="text-slate-400 text-sm">Izin/Sakit</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-400">{profile.totalIzin + profile.totalSakit}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="w-6 h-6 text-indigo-500" />
                    <span className="text-slate-400 text-sm">Attendance Rate</span>
                  </div>
                  <p className="text-3xl font-bold text-indigo-400">{profile.attendanceRate}%</p>
                </div>
              </div>
            </div>

            {/* Chart & History */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Attendance Chart */}
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <BarChart3 className="w-6 h-6 text-blue-400" />
                  Attendance Overview
                </h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[entry.name as keyof typeof COLORS]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Recent Activity */}
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Calendar className="w-6 h-6 text-blue-400" />
                  Recent Activity
                </h2>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {attendanceHistory.slice(0, 5).map((record, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(record.status)}
                        <div>
                          <p className="font-medium">{record.meetings.title}</p>
                          <p className="text-sm text-slate-400">
                            {format(new Date(record.meetings.date), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                        record.status === 'Hadir' ? 'bg-green-500/20 text-green-400' :
                        record.status === 'Late' ? 'bg-yellow-500/20 text-yellow-400' :
                        record.status === 'Alfa' ? 'bg-red-500/20 text-red-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {record.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Full History Table */}
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/10">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-400" />
                Full Attendance History
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Meeting</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Timestamp</th>
                      <th className="text-center py-3 px-4 text-slate-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceHistory.map((record, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          {format(new Date(record.meetings.date), 'dd MMM yyyy')}
                        </td>
                        <td className="py-3 px-4 font-medium">{record.meetings.title}</td>
                        <td className="py-3 px-4 text-slate-400">
                          {format(new Date(record.timestamp), 'HH:mm')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                            record.status === 'Hadir' ? 'bg-green-500/20 text-green-400' :
                            record.status === 'Late' ? 'bg-yellow-500/20 text-yellow-400' :
                            record.status === 'Alfa' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {getStatusIcon(record.status)}
                            {record.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
