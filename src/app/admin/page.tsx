'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

import { supabase } from '@/lib/supabase';
import { PlusCircle, QrCode, RefreshCcw, Users, Clock, CheckCircle, AlertTriangle, Download, Lock, Maximize2, X, Trash2, Archive, RotateCcw, Terminal, ShieldAlert, Image as ImageIcon, Camera, Menu, UserCircle, Search, Upload, Loader2, Sparkles, BarChart2, FileText, BarChart3, ArrowUpRight, UserPlus, ShieldCheck, ShieldOff, Edit2, Check, BookOpen, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';

type StudentProfile = {
  id: string;
  name: string;
  division: string;
  major?: string;
  tanggal_lahir?: string;
  noreg?: string;
  attendance_status?: 'Aktif' | 'Magang';
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
  const [showArchived, setShowArchived] = useState(false); // New state for archiving
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [latestAttendee, setLatestAttendee] = useState<any>(null); // For Realtime Sci-fi Notification
  
  // Security specific states
  const [securityLogs, setSecurityLogs] = useState<any[]>([]);
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null); // State for photo modal
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // New Management view states
  const [activeView, setActiveView] = useState<'meetings' | 'students' | 'analytics' | 'special-events'>('meetings');

  // ─── Special Events State ───
  type SpecialEvent = {
    id: string;
    title: string;
    event_type: 'Study Bible' | 'Doa Subuh' | 'Lainnya';
    date: string;
    description?: string;
    is_archived: boolean;
  };
  type SpecialAttendanceRecord = {
    id?: string;
    name: string;
    division: string;
    status: 'Hadir' | 'Alfa' | 'Izin' | 'Sakit';
    notes?: string;
  };

  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [selectedSpecialEvent, setSelectedSpecialEvent] = useState<SpecialEvent | null>(null);
  const [specialAttendance, setSpecialAttendance] = useState<SpecialAttendanceRecord[]>([]);
  const [specialEventLoading, setSpecialEventLoading] = useState(false);
  const [savingSpecialAtt, setSavingSpecialAtt] = useState(false);
  const [showCreateSpecialForm, setShowCreateSpecialForm] = useState(false);
  const [showArchivedSpecial, setShowArchivedSpecial] = useState(false);
  const [specialEventForm, setSpecialEventForm] = useState({
    title: '',
    event_type: 'Study Bible' as 'Study Bible' | 'Doa Subuh' | 'Lainnya',
    date: '',
    description: '',
  });
  const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allAttendances, setAllAttendances] = useState<any[]>([]);

  
  // Face Training states
  const [isImporting, setIsImporting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    major: '',
    divisi: '',
    tanggal_lahir: '',
    attendance_status: 'Aktif' as 'Aktif' | 'Magang'
  });

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true }); // Enable cellDates to parse dates properly
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet, { raw: false, dateNF: 'yyyy-mm-dd' }) as any[]; // Output as strings

      // Expected columns: Nama, Major, Divisi, Tanggal Lahir
      // Map it dynamically
      const mappedData = json.map(row => {
        const keys = Object.keys(row);
        const findKey = (search: string) => keys.find(k => k.toLowerCase().includes(search));
        
        let dob = row[findKey('lahir') || findKey('dob') || 'Tanggal Lahir'];
        // If it's still somehow a number (Excel serial), convert it manually
        if (typeof dob === 'number') {
           dob = new Date(Math.round((dob - 25569) * 86400 * 1000)).toISOString().split('T')[0];
        }

        return {
          name: row[findKey('name') || findKey('nama') || 'Nama'],
          major: row[findKey('major') || findKey('jurusan') || 'Major'],
          divisi: row[findKey('divisi') || 'Divisi'],
          tanggal_lahir: dob,
          attendance_status: row[findKey('status') || 'Status']
        };
      }).filter(r => r.name);

      if (mappedData.length === 0) {
        alert('Format Excel tidak valid atau kosong. Pastikan ada kolom Nama, Major, Divisi, dan Tanggal Lahir.');
        setIsImporting(false);
        return;
      }

      const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
      const res = await fetch('/api/profiles/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-token': adminPassword 
        },
        body: JSON.stringify({ students: mappedData })
      });

      const result = await res.json();
      if (res.ok) {
        alert(result.message);
        fetchAllStudents();
      } else {
        alert('Gagal mengimpor: ' + result.error);
      }
    } catch (err: any) {
      alert('Gagal membaca file Excel: ' + err.message);
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleManualFormChange = (
    key: 'name' | 'major' | 'divisi' | 'tanggal_lahir' | 'attendance_status',
    value: string
  ) => {
    setManualForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetManualForm = () => {
    setManualForm({ name: '', major: '', divisi: '', tanggal_lahir: '', attendance_status: 'Aktif' });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualForm.name.trim() || !manualForm.major.trim() || !manualForm.divisi || !manualForm.tanggal_lahir) {
      alert('Lengkapi semua field: Nama, Major, Divisi, dan Tanggal Lahir.');
      return;
    }

    setIsSubmittingManual(true);
    try {
      const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
      const res = await fetch('/api/profiles/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminPassword
        },
        body: JSON.stringify({
          students: [
            {
              name: manualForm.name.trim(),
              major: manualForm.major.trim(),
              divisi: manualForm.divisi,
              tanggal_lahir: manualForm.tanggal_lahir,
              attendance_status: manualForm.attendance_status
            }
          ]
        })
      });

      const result = await res.json();
      if (res.ok) {
        alert('Data mahasiswa berhasil ditambahkan.');
        resetManualForm();
        setShowManualForm(false);
        fetchAllStudents();
      } else {
        alert('Gagal menambah data: ' + (result.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Kesalahan jaringan: ' + err.message);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (!confirm(`Hapus mahasiswa ${name}?`)) return;
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
    try {
      const res = await fetch(`/api/profiles?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminPassword }
      });
      if (res.ok) fetchAllStudents();
    } catch (err) {
      alert('Kesalahan jaringan');
    }
  };

  const handleAttendanceStatusChange = async (
    student: StudentProfile,
    attendanceStatus: 'Aktif' | 'Magang'
  ) => {
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';

    try {
      const res = await fetch('/api/profiles', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminPassword
        },
        body: JSON.stringify({ id: student.id, attendanceStatus })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Gagal memperbarui status absensi.');
        return;
      }

      setAllStudents((students) => students.map((item) =>
        item.id === student.id ? { ...item, attendance_status: attendanceStatus } : item
      ));
    } catch (err) {
      alert('Kesalahan jaringan saat memperbarui status absensi.');
    }
  };

  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const handleDeleteAllStudents = async () => {
    if (!confirm(`PENGHAPUSAN MASSAL: Apakah Anda yakin ingin menghapus SELURUH data mahasiswa? Tindakan ini tidak dapat dibatalkan.`)) return;
    if (prompt('Ketik "HAPUS SEMUA" untuk mengkonfirmasi:') !== 'HAPUS SEMUA') {
      alert('Konfirmasi dibatalkan.');
      return;
    }

    setIsDeletingAll(true);
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
    try {
      const res = await fetch(`/api/profiles?all=true`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminPassword }
      });
      if (res.ok) {
        alert('Seluruh data mahasiswa berhasil dihapus.');
        fetchAllStudents();
      } else {
        const errorData = await res.json();
        alert('Gagal menghapus: ' + errorData.error);
      }
    } catch (err) {
      alert('Kesalahan jaringan saat menghapus semua data.');
    } finally {
      setIsDeletingAll(false);
    }
  };


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
    fetchAllStudents();
    fetchAllAttendances();
  }, [showArchived, activeView]); // Re-fetch on toggle

  useEffect(() => {
    if (activeView === 'special-events') {
      fetchSpecialEvents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, showArchivedSpecial]);


  const fetchAllStudents = async () => {
    try {
      // Fetch Profiles
    fetch('/api/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.profiles) setAllStudents(data.profiles);
      });
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  const fetchAllAttendances = async () => {
    try {
      // Fetch all attendance records with meeting info
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          meetings (
            title,
            date
          )
        `);

      if (data) setAllAttendances(data);
      if (error) throw error;
    } catch (err) {
      console.error("Error fetching all attendances:", err);
    }
  };

  // ─── Special Events Functions ───
  const fetchSpecialEvents = async () => {
    setSpecialEventLoading(true);
    try {
      const params = showArchivedSpecial ? '?archived=true' : '';
      const res = await fetch(`/api/special-events${params}`);
      const data = await res.json();
      if (data.events) setSpecialEvents(data.events);
    } catch (err) {
      console.error('Error fetching special events:', err);
    } finally {
      setSpecialEventLoading(false);
    }
  };

  const fetchSpecialAttendance = async (eventId: string) => {
    try {
      const res = await fetch(`/api/special-events/attendance?eventId=${eventId}`);
      const data = await res.json();
      if (data.attendance) {
        setSpecialAttendance(data.attendance);
      }
    } catch (err) {
      console.error('Error fetching special attendance:', err);
    }
  };

  // Build full list merging all students with existing attendance for the event
  const buildSpecialAttendanceSheet = async (eventId: string) => {
    try {
      const [profilesRes, attRes] = await Promise.all([
        fetch('/api/profiles'),
        fetch(`/api/special-events/attendance?eventId=${eventId}`)
      ]);
      const profilesData = await profilesRes.json();
      const attData = await attRes.json();

      const existing: Record<string, SpecialAttendanceRecord> = {};
      (attData.attendance || []).forEach((r: any) => {
        existing[r.name.toLowerCase()] = r;
      });

      const sheet: SpecialAttendanceRecord[] = (profilesData.profiles || [])
        .filter((p: any) => p.attendance_status !== 'Magang')
        .map((p: any) => existing[p.name.toLowerCase()] ?? {
          name: p.name,
          division: p.division,
          status: 'Hadir' as const,
          notes: '',
        });

      setSpecialAttendance(sheet);
    } catch (err) {
      console.error('Error building attendance sheet:', err);
    }
  };

  const handleCreateSpecialEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialEventForm.title || !specialEventForm.event_type || !specialEventForm.date) {
      alert('Judul, tipe kegiatan, dan tanggal wajib diisi.');
      return;
    }
    try {
      const res = await fetch('/api/special-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminPassword },
        body: JSON.stringify(specialEventForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateSpecialForm(false);
        setSpecialEventForm({ title: '', event_type: 'Study Bible', date: '', description: '' });
        fetchSpecialEvents();
        if (data.event) {
          setSelectedSpecialEvent(data.event);
          buildSpecialAttendanceSheet(data.event.id);
        }
      } else {
        alert(data.error || 'Gagal membuat kegiatan.');
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    }
  };

  const handleSaveSpecialAttendance = async () => {
    if (!selectedSpecialEvent) return;
    setSavingSpecialAtt(true);
    try {
      const res = await fetch('/api/special-events/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminPassword },
        body: JSON.stringify({
          eventId: selectedSpecialEvent.id,
          records: specialAttendance,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.count} data kehadiran berhasil disimpan.`);
      } else {
        alert(data.error || 'Gagal menyimpan.');
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    } finally {
      setSavingSpecialAtt(false);
    }
  };

  const handleDeleteSpecialEvent = async (id: string, title: string) => {
    if (!confirm(`Hapus kegiatan "${title}"? Semua data kehadiran akan ikut terhapus.`)) return;
    try {
      const res = await fetch(`/api/special-events?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminPassword },
      });
      if (res.ok) {
        fetchSpecialEvents();
        if (selectedSpecialEvent?.id === id) {
          setSelectedSpecialEvent(null);
          setSpecialAttendance([]);
        }
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    }
  };

  const handleArchiveSpecialEvent = async (id: string, archive: boolean) => {
    try {
      const res = await fetch('/api/special-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminPassword },
        body: JSON.stringify({ id, is_archived: archive }),
      });
      if (res.ok) {
        fetchSpecialEvents();
        if (selectedSpecialEvent?.id === id) setSelectedSpecialEvent(null);
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    }
  };

  const updateSpecialAttStatus = (name: string, status: 'Hadir' | 'Alfa' | 'Izin' | 'Sakit') => {
    setSpecialAttendance(prev =>
      prev.map(r => r.name === name ? { ...r, status } : r)
    );
  };


  const getTrendData = () => {
    const meetingMap: Record<string, number> = {};
    allAttendances.forEach((att: any) => {
      const title = att.meetings?.title || 'Unknown';
      meetingMap[title] = (meetingMap[title] || 0) + 1;
    });

    return Object.keys(meetingMap).map(key => ({
      name: key,
      Hadir: meetingMap[key]
    })).slice(-10);
  };

  const getDivisionData = () => {
    const divMap: Record<string, number> = {};
    DIVISIONS.forEach(div => divMap[div] = 0);
    
    allAttendances.forEach((att: any) => {
      if (att.division && divMap[att.division] !== undefined) {
        divMap[att.division]++;
      }
    });

    return Object.keys(divMap).map(key => ({
      name: key,
      Count: divMap[key]
    })).sort((a: any, b: any) => b.Count - a.Count);
  };

  const getLeaderboard = () => {
    const studentMap: Record<string, { name: string, division: string, count: number }> = {};
    
    allAttendances.forEach((att: any) => {
      if (!studentMap[att.name]) {
        studentMap[att.name] = { name: att.name, division: att.division, count: 0 };
      }
      studentMap[att.name].count++;
    });

    return Object.values(studentMap).sort((a: any, b: any) => b.count - a.count);
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

  const handleEditMeetingTitle = async (meetingId: string) => {
    if (!editingTitle.trim()) return;
    const { error } = await supabase.from('meetings').update({ title: editingTitle.trim() }).eq('id', meetingId);
    if (error) {
      alert('Error updating title: ' + error.message);
    } else {
      fetchMeetings();
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting({ ...selectedMeeting, title: editingTitle.trim() });
      }
    }
    setEditingMeetingId(null);
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
      start_time: '00:00',
      attendance_limit_minutes: 999,
      is_archived: false,
      qr_token: crypto.randomUUID(),
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
    doc.text(`Izin: ${stats.izin}`, 14, finalY + 36);
    doc.text(`Sakit: ${stats.sakit}`, 14, finalY + 43);
    doc.text(`Alfa: ${stats.alfa}`, 14, finalY + 50);
    doc.text(`Total Peserta: ${stats.total}`, 14, finalY + 57);

    doc.save(`Recap_${selectedMeeting.title}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  // ─── MARK ALFA & AUTO HADIR ───
  const [markingAlfa, setMarkingAlfa] = useState(false);
  const [autoHadirLoading, setAutoHadirLoading] = useState(false);

  const handleAutoHadir = async () => {
    if (!selectedMeeting) return;
    if (!confirm(`PENTING: Tandai SEMUA mahasiswa yang belum absen di sesi "${selectedMeeting.title}" sebagai Hadir?`)) return;

    setAutoHadirLoading(true);
    try {
      const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminPassword
        },
        body: JSON.stringify({ meetingId: selectedMeeting.id, action: 'auto-hadir' })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`${data.marked} mahasiswa berhasil ditandai Hadir.`);
        fetchAttendance(selectedMeeting.id);
      } else {
        alert(data.error || 'Gagal menandai Hadir otomatis.');
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    } finally {
      setAutoHadirLoading(false);
    }
  };
  const handleMarkAlfa = async () => {
    if (!selectedMeeting) return;
    if (!confirm(`Tandai semua mahasiswa yang tidak hadir di "${selectedMeeting.title}" sebagai Alfa?`)) return;

    setMarkingAlfa(true);
    try {
      const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '8182838485';
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminPassword
        },
        body: JSON.stringify({ meetingId: selectedMeeting.id })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`${data.marked} mahasiswa ditandai Alfa.`);
        fetchAttendance(selectedMeeting.id);
      } else {
        alert(data.error || 'Gagal menandai Alfa.');
      }
    } catch (err) {
      alert('Kesalahan jaringan.');
    } finally {
      setMarkingAlfa(false);
    }
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
      case 'Alfa': return 'border-red-500/50 text-red-500 bg-red-950/30';
      case 'Izin': return 'border-blue-500/50 text-blue-400 bg-blue-950/30';
      case 'Sakit': return 'border-purple-500/50 text-purple-400 bg-purple-950/30';
      default: return 'border-slate-500/50 text-slate-400 bg-slate-900/30';
    }
  };

  const stats = {
    hadir: attendances.filter(a => a.status === 'Hadir').length,
    late: attendances.filter(a => a.status === 'Late').length,
    alfa: attendances.filter(a => a.status === 'Alfa').length,
    izin: attendances.filter(a => a.status === 'Izin').length,
    sakit: attendances.filter(a => a.status === 'Sakit').length,
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

               <button
                  onClick={() => setActiveView('special-events')}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    activeView === 'special-events'
                      ? 'bg-purple-50 border-purple-100 text-purple-900 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
               >
                  <BookOpen size={18} className={activeView === 'special-events' ? 'text-purple-600' : 'text-slate-400'} />
                  <span className="font-medium text-sm">Kegiatan Khusus</span>
               </button>

               <a
                  href="/analytics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all border bg-transparent border-transparent hover:bg-slate-50 text-slate-600"
               >
                  <BarChart3 size={18} className="text-slate-400" />
                  <span className="font-medium text-sm">Analytics Dashboard</span>
                  <ArrowUpRight size={14} className="ml-auto text-slate-400" />
               </a>
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
                      <div className="w-full">
                          {editingMeetingId === meeting.id ? (
                              <div className="flex items-center gap-2 mb-1.5" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    autoFocus
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    className="w-full px-2 py-1 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleEditMeetingTitle(meeting.id);
                                        if (e.key === 'Escape') setEditingMeetingId(null);
                                    }}
                                  />
                                  <button onClick={() => handleEditMeetingTitle(meeting.id)} className="text-blue-600 p-1 hover:bg-blue-100 rounded">
                                      <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingMeetingId(null)} className="text-slate-400 p-1 hover:bg-slate-100 rounded">
                                      <X size={14} />
                                  </button>
                              </div>
                          ) : (
                              <h4 className={`font-medium text-sm ${selectedMeeting?.id === meeting.id ? 'text-blue-700' : 'text-slate-700'}`}>
                                 {meeting.title}
                              </h4>
                          )}
                          <div className="text-xs mt-1.5 flex items-center gap-3 opacity-70">
                             <span className="flex items-center gap-1"><Clock size={10}/> {meeting.date}</span>
                          </div>
                      </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={`mt-3 pt-3 border-t flex justify-end gap-2 ${selectedMeeting?.id === meeting.id ? 'border-blue-200/50' : 'border-slate-200 hidden group-hover:flex'}`}>
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setEditingMeetingId(meeting.id);
                          setEditingTitle(meeting.title);
                        }}
                        className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit Session Title"
                      >
                        <Edit2 size={14} />
                      </button>
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
                       <input name="meetingTitle" placeholder="e.g Rapat Rabu Malam" required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 mb-2">Tanggal</label>
                       <input name="date" type="date" required className="w-full bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm" />
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

            {activeView === 'analytics' && (
              <div className="space-y-6 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Sessions', value: meetings.length, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Total Students', value: allStudents.length, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
                    { 
                      label: 'Avg Attendance', 
                      value: meetings.length > 0 ? (allAttendances.length / meetings.length).toFixed(1) : 0, 
                      icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' 
                    },
                    { 
                      label: 'Latest Attendance', 
                      value: attendances.length, 
                      icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-50' 
                    },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                          <stat.icon size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                          <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Attendance Trend Chart */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <BarChart2 size={20} className="text-blue-600" />
                       Tren Kehadiran
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={getTrendData()}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Area type="monotone" dataKey="Hadir" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Division Chart */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <Users size={20} className="text-violet-600" />
                       Partisipasi per Divisi
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getDivisionData()} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} width={100} />
                          <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="Count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Leaderboard Kehadiran</h3>
                    <span className="text-xs font-medium text-slate-500">Top 10 Mahasiswa Paling Aktif</span>
                  </div>
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-3 text-left">Ranking</th>
                          <th className="px-6 py-3 text-left">Nama</th>
                          <th className="px-6 py-3 text-left">Divisi</th>
                          <th className="px-6 py-3 text-center">Total Hadir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {getLeaderboard().slice(0, 10).map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                                i === 0 ? 'bg-amber-100 text-amber-700' :
                                i === 1 ? 'bg-slate-100 text-slate-700' :
                                i === 2 ? 'bg-orange-100 text-orange-700' :
                                'text-slate-400'
                              }`}>
                                {i + 1}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-800">{item.name}</td>
                            <td className="px-6 py-4 text-slate-500">{item.division}</td>
                            <td className="px-6 py-4 text-center">
                              <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                                {item.count}
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

            {activeView === 'students' ? (
              <div className="space-y-6 animate-fade-in-up">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-slate-50/50">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Manajemen Mahasiswa</h2>
                      <p className="text-sm text-slate-500 mt-1">Kelola data mahasiswa, tambah manual, dan import via Excel.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowManualForm((prev) => !prev)}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm shrink-0"
                      >
                        <UserPlus size={16} />
                        {showManualForm ? 'Tutup Form' : 'Tambah Manual'}
                      </button>
                      <button 
                        onClick={handleDeleteAllStudents}
                        disabled={isDeletingAll || allStudents.length === 0}
                        className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm shrink-0"
                      >
                        {isDeletingAll ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Hapus Semua
                      </button>
                      <label className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm shrink-0 cursor-pointer">
                        {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        {isImporting ? 'Mengimpor...' : 'Import Excel'}
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} disabled={isImporting} />
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                          type="text" 
                          placeholder="Cari nama atau jurusan..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-64 shadow-sm"
                      />
                      </div>
                    </div>
                  </div>

                  {showManualForm && (
                    <form onSubmit={handleManualSubmit} className="px-6 py-5 border-b border-slate-200 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <input
                          type="text"
                          placeholder="Nama Lengkap"
                          value={manualForm.name}
                          onChange={(e) => handleManualFormChange('name', e.target.value)}
                          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          disabled={isSubmittingManual}
                          required
                        />
                        <input
                          type="text"
                          placeholder="Major"
                          value={manualForm.major}
                          onChange={(e) => handleManualFormChange('major', e.target.value)}
                          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          disabled={isSubmittingManual}
                          required
                        />
                        <select
                          value={manualForm.divisi}
                          onChange={(e) => handleManualFormChange('divisi', e.target.value)}
                          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          disabled={isSubmittingManual}
                          required
                        >
                          <option value="">Pilih Divisi</option>
                          {DIVISIONS.map((division) => (
                            <option key={division} value={division}>{division}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={manualForm.tanggal_lahir}
                          onChange={(e) => handleManualFormChange('tanggal_lahir', e.target.value)}
                          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          disabled={isSubmittingManual}
                          required
                        />
                        <select
                          value={manualForm.attendance_status}
                          onChange={(e) => handleManualFormChange('attendance_status', e.target.value)}
                          className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          disabled={isSubmittingManual}
                        >
                          <option value="Aktif">Aktif</option>
                          <option value="Magang">Magang (tanpa absensi)</option>
                        </select>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={isSubmittingManual}
                          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
                        >
                          {isSubmittingManual ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                          {isSubmittingManual ? 'Menyimpan...' : 'Simpan Data Manual'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetManualForm();
                            setShowManualForm(false);
                          }}
                          disabled={isSubmittingManual}
                          className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-sm"
                        >
                          Batal
                        </button>
                      </div>
                    </form>
                  )}
                  
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="px-4 py-4 text-left">Nama Lengkap</th>
                          <th className="px-4 py-4 text-left">Major</th>
                          <th className="px-4 py-4 text-left">Divisi</th>
                          <th className="px-4 py-4 text-left">Tgl Lahir</th>
                          <th className="px-4 py-4 text-left">Status Absensi</th>
                          <th className="px-3 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle size={10}/>Hadir</span>
                          </th>
                          <th className="px-3 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-amber-600"><Clock size={10}/>Late</span>
                          </th>
                          <th className="px-3 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-blue-600">Izin</span>
                          </th>
                          <th className="px-3 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-purple-600">Sakit</span>
                          </th>
                          <th className="px-3 py-4 text-center">
                            <span className="inline-flex items-center gap-1 text-red-600">Alfa</span>
                          </th>
                          <th className="px-3 py-4 text-center">Total</th>
                          <th className="px-4 py-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allStudents
                          .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.division.toLowerCase().includes(searchQuery.toLowerCase()) || (s.major && s.major.toLowerCase().includes(searchQuery.toLowerCase())))
                          .map((student) => {
                            const studentAtt = allAttendances.filter((a: any) => a.name.toLowerCase().trim() === student.name.toLowerCase().trim());
                            const hadir = studentAtt.filter((a: any) => a.status === 'Hadir').length;
                            const late = studentAtt.filter((a: any) => a.status === 'Late').length;
                            const izin = studentAtt.filter((a: any) => a.status === 'Izin').length;
                            const sakit = studentAtt.filter((a: any) => a.status === 'Sakit').length;
                            const alfa = studentAtt.filter((a: any) => a.status === 'Alfa').length;
                            const total = studentAtt.length;

                            return (
                              <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                      <UserCircle size={20} />
                                    </div>
                                    <span className="font-semibold text-slate-800">{student.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-slate-500">{student.major || '-'}</td>
                                <td className="px-4 py-4 text-slate-500">{student.division}</td>
                                <td className="px-4 py-4 text-slate-500 font-mono text-xs">{student.tanggal_lahir ? format(new Date(student.tanggal_lahir), 'dd MMM yyyy') : '-'}</td>
                                <td className="px-4 py-4">
                                  <select
                                    value={student.attendance_status || 'Aktif'}
                                    onChange={(e) => handleAttendanceStatusChange(student, e.target.value as 'Aktif' | 'Magang')}
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition-colors ${
                                      student.attendance_status === 'Magang'
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    }`}
                                    aria-label={`Status absensi ${student.name}`}
                                  >
                                    <option value="Aktif">Aktif</option>
                                    <option value="Magang">Magang</option>
                                  </select>
                                  {student.attendance_status === 'Magang' && (
                                    <p className="mt-1 text-[10px] text-amber-600">Tidak perlu absen</p>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${hadir > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'text-slate-300'}`}>
                                    {hadir}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${late > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'text-slate-300'}`}>
                                    {late}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${izin > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-300'}`}>
                                    {izin}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${sakit > 0 ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'text-slate-300'}`}>
                                    {sakit}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold ${alfa > 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'text-slate-300'}`}>
                                    {alfa}
                                  </span>
                                </td>
                                <td className="px-3 py-4 text-center">
                                  <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {total}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <button
                                    onClick={() => handleDeleteStudent(student.id, student.name)}
                                    className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={16} />
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
            ) : activeView === 'special-events' ? (
              /* ─────────────────────────────────────────
                 SPECIAL EVENTS VIEW (Study Bible / Doa Subuh)
                 ───────────────────────────────────────── */
              <div className="space-y-6 animate-fade-in-up">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-xl text-purple-600"><BookOpen size={22} /></div>
                      Kegiatan Khusus
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Kelola Study Bible &amp; Doa Subuh</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowArchivedSpecial(!showArchivedSpecial)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${showArchivedSpecial ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {showArchivedSpecial ? <RotateCcw size={14} /> : <Archive size={14} />}
                      {showArchivedSpecial ? 'Tampilkan Aktif' : 'Arsip'}
                    </button>
                    {!showArchivedSpecial && (
                      <button
                        onClick={() => setShowCreateSpecialForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
                      >
                        <PlusCircle size={16} />
                        Buat Kegiatan
                      </button>
                    )}
                  </div>
                </div>

                {/* Create Form */}
                {showCreateSpecialForm && (
                  <div className="bg-white border border-purple-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-purple-50/50 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-800">Buat Kegiatan Baru</h3>
                      <button onClick={() => setShowCreateSpecialForm(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
                        <X size={16} />
                      </button>
                    </div>
                    <form onSubmit={handleCreateSpecialEvent} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Judul Kegiatan *</label>
                        <input
                          value={specialEventForm.title}
                          onChange={e => setSpecialEventForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Contoh: Study Bible Minggu ke-3"
                          required
                          className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipe Kegiatan *</label>
                        <select
                          value={specialEventForm.event_type}
                          onChange={e => setSpecialEventForm(f => ({ ...f, event_type: e.target.value as any }))}
                          required
                          className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none appearance-none"
                        >
                          <option value="Study Bible">Study Bible</option>
                          <option value="Doa Subuh">Doa Subuh</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Tanggal *</label>
                        <input
                          type="date"
                          value={specialEventForm.date}
                          onChange={e => setSpecialEventForm(f => ({ ...f, date: e.target.value }))}
                          required
                          className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Keterangan (opsional)</label>
                        <input
                          value={specialEventForm.description}
                          onChange={e => setSpecialEventForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Topik, lokasi, dll."
                          className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end gap-3 pt-2 border-t border-slate-100 mt-2">
                        <button type="button" onClick={() => setShowCreateSpecialForm(false)} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-50 border border-transparent hover:border-slate-200 rounded-xl transition-all text-sm">Batal</button>
                        <button type="submit" className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2">
                          <PlusCircle size={15} /> Buat Kegiatan
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Content: event list + attendance editor side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Event List */}
                  <div className="lg:col-span-1 space-y-2">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1 mb-3">
                      {showArchivedSpecial ? 'Arsip' : 'Aktif'} ({specialEvents.length})
                    </h3>
                    {specialEventLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="animate-spin text-purple-400" size={24} />
                      </div>
                    ) : specialEvents.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                        Belum ada kegiatan
                      </div>
                    ) : (
                      specialEvents.map(ev => {
                        const isSelected = selectedSpecialEvent?.id === ev.id;
                        const typeColor: Record<string, string> = {
                          'Study Bible': 'bg-blue-50 text-blue-700 border-blue-200',
                          'Doa Subuh': 'bg-amber-50 text-amber-700 border-amber-200',
                          'Lainnya': 'bg-slate-50 text-slate-600 border-slate-200',
                        };
                        return (
                          <div
                            key={ev.id}
                            onClick={() => {
                              setSelectedSpecialEvent(ev);
                              buildSpecialAttendanceSheet(ev.id);
                            }}
                            className={`group p-4 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-purple-50 border-purple-200 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border mb-1.5 ${typeColor[ev.event_type]}`}>
                                  {ev.event_type}
                                </span>
                                <p className="font-semibold text-sm text-slate-800 truncate">{ev.title}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{format(new Date(ev.date), 'dd MMM yyyy')}</p>
                                {ev.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{ev.description}</p>}
                              </div>
                              <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={e => { e.stopPropagation(); handleArchiveSpecialEvent(ev.id, !ev.is_archived); }}
                                  className="p-1.5 rounded text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                  title={ev.is_archived ? 'Pulihkan' : 'Arsipkan'}
                                >
                                  {ev.is_archived ? <RotateCcw size={14} /> : <Archive size={14} />}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteSpecialEvent(ev.id, ev.title); }}
                                  className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Hapus"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Attendance Editor */}
                  <div className="lg:col-span-2">
                    {!selectedSpecialEvent ? (
                      <div className="bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center py-20 text-center">
                        <BookOpen size={40} className="text-slate-300 mb-3" />
                        <p className="text-slate-400 font-medium">Pilih kegiatan di sebelah kiri</p>
                        <p className="text-slate-300 text-sm mt-1">untuk mengelola kehadiran</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                          <div>
                            <h3 className="font-bold text-slate-800">{selectedSpecialEvent.title}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {selectedSpecialEvent.event_type} · {format(new Date(selectedSpecialEvent.date), 'dd MMMM yyyy')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex gap-3 text-xs font-medium">
                              <span className="text-green-600">{specialAttendance.filter(r => r.status === 'Hadir').length} Hadir</span>
                              <span className="text-blue-600">{specialAttendance.filter(r => r.status === 'Izin').length} Izin</span>
                              <span className="text-purple-600">{specialAttendance.filter(r => r.status === 'Sakit').length} Sakit</span>
                              <span className="text-red-500">{specialAttendance.filter(r => r.status === 'Alfa').length} Alfa</span>
                            </div>
                            <button
                              onClick={handleSaveSpecialAttendance}
                              disabled={savingSpecialAtt}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl text-sm font-medium transition-all shadow-sm"
                            >
                              {savingSpecialAtt ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              Simpan
                            </button>
                          </div>
                        </div>

                        {/* Shortcut: mark all */}
                        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-500 font-medium mr-1">Tandai Semua:</span>
                          {(['Hadir', 'Alfa', 'Izin', 'Sakit'] as const).map(s => {
                            const colors: Record<string, string> = {
                              Hadir: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
                              Alfa: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
                              Izin: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                              Sakit: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
                            };
                            return (
                              <button
                                key={s}
                                onClick={() => setSpecialAttendance(prev => prev.map(r => ({ ...r, status: s })))}
                                className={`text-xs font-semibold px-3 py-1 rounded-lg border transition-all ${colors[s]}`}
                              >
                                {s}
                              </button>
                            );
                          })}
                        </div>

                        {/* Table */}
                        <div className="overflow-y-auto max-h-[520px]">
                          <table className="w-full">
                            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                              <tr>
                                <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3">Nama</th>
                                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 hidden sm:table-cell">Divisi</th>
                                <th className="text-center text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {specialAttendance.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-10 text-slate-400 text-sm">Memuat data...</td></tr>
                              ) : (
                                specialAttendance.map((record, idx) => {
                                  const statusStyles: Record<string, string> = {
                                    Hadir: 'bg-green-500',
                                    Alfa: 'bg-red-500',
                                    Izin: 'bg-blue-500',
                                    Sakit: 'bg-purple-500',
                                  };
                                  return (
                                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-3">
                                        <span className="font-medium text-sm text-slate-800">{record.name}</span>
                                      </td>
                                      <td className="px-4 py-3 hidden sm:table-cell">
                                        <span className="text-xs text-slate-500">{record.division}</span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                          {(['Hadir', 'Alfa', 'Izin', 'Sakit'] as const).map(s => (
                                            <button
                                              key={s}
                                              onClick={() => updateSpecialAttStatus(record.name, s)}
                                              className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all border ${
                                                record.status === s
                                                  ? `${statusStyles[s]} text-white border-transparent shadow-sm`
                                                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                              }`}
                                            >
                                              {s}
                                            </button>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
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
                   <div className="flex flex-col xl:flex-row gap-6 items-stretch">
                      {/* Stats Grid */}
                      <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-5">
                          {[
                             { label: 'Present', val: stats.hadir, color: 'emerald', icon: CheckCircle },
                             { label: 'Late', val: stats.late, color: 'amber', icon: Clock },
                             { label: 'Izin', val: stats.izin, color: 'blue', icon: CheckCircle },
                             { label: 'Sakit', val: stats.sakit, color: 'purple', icon: AlertTriangle },
                             { label: 'Alfa', val: stats.alfa, color: 'red', icon: AlertTriangle },
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
                            </div>
                         </div>
                          <div className="flex gap-2 flex-wrap">
                             <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm">
                                <Download size={14} /> CSV
                             </button>
                             <button onClick={handleExportPDF} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm">
                                <Download size={14} /> PDF
                             </button>
                             <button 
                               onClick={handleAutoHadir} 
                               disabled={autoHadirLoading || selectedMeeting?.is_archived}
                               className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
                             >
                               {autoHadirLoading ? <RefreshCcw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                               {autoHadirLoading ? 'Processing...' : 'Auto-Hadir Semua'}
                             </button>
                             <button 
                               onClick={handleMarkAlfa} 
                               disabled={markingAlfa || selectedMeeting?.is_archived}
                               className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
                             >
                               {markingAlfa ? <RefreshCcw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                               {markingAlfa ? 'Processing...' : 'Mark Alfa'}
                             </button>
                          </div>
                      </div>

                      <div className="p-4 md:p-6 space-y-6">
                         {/* Dynamically group by actual divisions found in data */}
                         {Array.from(new Set(attendances.map(a => a.division || 'Tanpa Divisi'))).sort().map(division => {
                            const divisionAttendees = attendances.filter(a => (a.division || 'Tanpa Divisi') === division);
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
                                                       record.status === 'Late' ? 'text-amber-600' : record.status === 'Alfa' ? 'text-red-600' : record.status === 'Izin' ? 'text-blue-600' : record.status === 'Sakit' ? 'text-purple-600' : 'text-emerald-600'
                                                   }`}>
                                                       <span className="flex items-center gap-1.5">
                                                          {record.status === 'Hadir' || record.status === 'Izin' ? <CheckCircle size={14}/> : record.status === 'Sakit' ? <AlertTriangle size={14}/> : <Clock size={14}/>}
                                                         {record.status}
                                                      </span>
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
