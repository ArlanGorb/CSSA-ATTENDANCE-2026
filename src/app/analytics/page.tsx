'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Scatter
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, Clock, CheckCircle, AlertCircle, 
  Download, Calendar, Filter, ArrowUpRight, ArrowDownRight, Eye, FileText,
  BarChart3, PieChart as PieChartIcon, Activity, Award, Target, Search, BookOpen
} from 'lucide-react';
import { format, subMonths, subWeeks, startOfMonth, endOfMonth } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';

interface MeetingStats {
  id: string;
  title: string;
  date: string;
  totalAttendance: number;
  hadir: number;
  late: number;
  izin: number;
  sakit: number;
  alfa: number;
  attendanceRate: number;
}

interface DivisionStats {
  division: string;
  totalMembers: number;
  totalAttendance: number;
  averageAttendance: number;
  hadirRate: number;
  lateRate: number;
  absenceRate: number;
}

interface TimeSeriesData {
  date: string;
  meeting: string;
  attendance: number;
  hadir: number;
  late: number;
  absence: number;
}

interface MemberPerformance {
  name: string;
  division: string;
  totalRecords: number;
  hadir: number;
  late: number;
  izin: number;
  sakit: number;
  alfa: number;
  attendanceRate: number;
}

const COLORS = {
  hadir: '#22c55e',
  late: '#eab308',
  izin: '#3b82f6',
  sakit: '#a855f7',
  alfa: '#ef4444',
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444'
};

type TimeRange = '7d' | '30d' | '90d' | 'all';

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  
  // Data states
  const [meetingStats, setMeetingStats] = useState<MeetingStats[]>([]);
  const [divisionStats, setDivisionStats] = useState<DivisionStats[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [memberPerformance, setMemberPerformance] = useState<MemberPerformance[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [overallStats, setOverallStats] = useState({
    totalMeetings: 0,
    totalAttendance: 0,
    averageAttendance: 0,
    overallHadirRate: 0,
    overallLateRate: 0,
    overallAbsenceRate: 0,
    totalMembers: 0
  });
  const [specialEventStats, setSpecialEventStats] = useState({
    totalEvents: 0,
    totalStudyBible: 0,
    totalDoaSubuh: 0,
    overallHadirRate: 0,
  });

  const DIVISIONS = [
    "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
    "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
  ];

  const normalizeDivision = (div: string) => {
    if (!div) return 'Unknown';
    const normalized = DIVISIONS.find(d => d.toLowerCase() === div.toLowerCase());
    return normalized || div;
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange, selectedDivision]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchMeetingStats(),
        fetchDivisionStats(),
        fetchTimeSeriesData(),
        fetchOverallStats(),
        fetchMemberPerformance(),
        fetchSpecialEventStats(),
      ]);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecialEventStats = async () => {
    const [{ data: events }, { data: attendance }] = await Promise.all([
      supabase.from('special_events').select('id, event_type').eq('is_archived', false),
      supabase.from('special_event_attendance').select('status, special_events(event_type)'),
    ]);

    const totalEvents = events?.length || 0;
    const totalStudyBible = events?.filter((e: any) => e.event_type === 'Study Bible').length || 0;
    const totalDoaSubuh = events?.filter((e: any) => e.event_type === 'Doa Subuh').length || 0;
    const totalSpecialAtt = attendance?.length || 0;
    const totalHadir = attendance?.filter((a: any) => a.status === 'Hadir').length || 0;
    const overallHadirRate = totalSpecialAtt > 0 ? Math.round((totalHadir / totalSpecialAtt) * 100) : 0;

    setSpecialEventStats({ totalEvents, totalStudyBible, totalDoaSubuh, overallHadirRate });
  };

  const fetchMeetingStats = async () => {
    let query = supabase
      .from('meetings')
      .select(`
        id,
        title,
        date,
        attendance (
          status
        )
      `)
      .order('date', { ascending: false });

    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query = query.gte('date', startDate.toISOString().split('T')[0]);
    }

    if (selectedDivision !== 'all') {
      query = query.contains('attendance', { division: selectedDivision });
    }

    const { data, error } = await query;
    if (error) throw error;

    const stats = data.map((meeting: any) => {
      const attendance = meeting.attendance || [];
      const hadir = attendance.filter((a: any) => a.status === 'Hadir').length;
      const late = attendance.filter((a: any) => a.status === 'Late').length;
      const izin = attendance.filter((a: any) => a.status === 'Izin').length;
      const sakit = attendance.filter((a: any) => a.status === 'Sakit').length;
      const alfa = attendance.filter((a: any) => a.status === 'Alfa').length;
      const totalAttendance = attendance.length;

      return {
        id: meeting.id,
        title: meeting.title,
        date: meeting.date,
        totalAttendance,
        hadir,
        late,
        izin,
        sakit,
        alfa,
        attendanceRate: totalAttendance > 0 
          ? Math.round(((hadir + late) / totalAttendance) * 100) 
          : 0
      };
    });

    setMeetingStats(stats);
  };

  const fetchDivisionStats = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('name, division, status, meeting_id');

    if (error) throw error;

    const divisionMap: Record<string, DivisionStats> = {};
    
    DIVISIONS.forEach(div => {
      divisionMap[div] = {
        division: div,
        totalMembers: 0,
        totalAttendance: 0,
        averageAttendance: 0,
        hadirRate: 0,
        lateRate: 0,
        absenceRate: 0
      };
    });

    const memberSet = new Set<string>();
    
    data.forEach((record: any) => {
      const normDiv = normalizeDivision(record.division);
      if (!divisionMap[normDiv]) return;
      
      memberSet.add(`${normDiv}-${record.name}`);
      divisionMap[normDiv].totalAttendance++;
      
      if (record.status === 'Hadir') {
        divisionMap[normDiv].hadirRate++;
      } else if (record.status === 'Late') {
        divisionMap[normDiv].lateRate++;
      } else {
        divisionMap[normDiv].absenceRate++;
      }
    });

    // Calculate unique members per division
    memberSet.forEach(member => {
      const [div] = member.split('-');
      if (divisionMap[div]) {
        divisionMap[div].totalMembers++;
      }
    });

    // Calculate rates
    Object.values(divisionMap).forEach(div => {
      if (div.totalAttendance > 0) {
        div.hadirRate = Math.round((div.hadirRate / div.totalAttendance) * 100);
        div.lateRate = Math.round((div.lateRate / div.totalAttendance) * 100);
        div.absenceRate = Math.round((div.absenceRate / div.totalAttendance) * 100);
        div.averageAttendance = Math.round(div.totalAttendance / (div.totalMembers || 1));
      }
    });

    setDivisionStats(Object.values(divisionMap).sort((a, b) => b.hadirRate - a.hadirRate));
  };

  const fetchTimeSeriesData = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        date,
        title,
        attendance (
          status
        )
      `)
      .order('date', { ascending: true });

    if (error) throw error;

    const seriesData = data.map((meeting: any) => {
      const attendance = meeting.attendance || [];
      const hadir = attendance.filter((a: any) => a.status === 'Hadir').length;
      const late = attendance.filter((a: any) => a.status === 'Late').length;
      const absence = attendance.filter((a: any) => 
        ['Izin', 'Sakit', 'Alfa'].includes(a.status)
      ).length;

      return {
        date: format(new Date(meeting.date), 'dd MMM'),
        meeting: meeting.title,
        attendance: attendance.length,
        hadir,
        late,
        absence
      };
    });

    setTimeSeriesData(seriesData);
  };

  const fetchOverallStats = async () => {
    const { data: meetings } = await supabase
      .from('meetings')
      .select('id');

    const { data: attendance } = await supabase
      .from('attendance')
      .select('status, name, division');

    const { data: members } = await supabase
      .from('user_profiles')
      .select('id');

    if (!attendance || !meetings) return;

    const totalMeetings = meetings.length;
    const totalAttendance = attendance.length;
    const hadir = attendance.filter(a => a.status === 'Hadir').length;
    const late = attendance.filter(a => a.status === 'Late').length;
    const absence = attendance.filter(a => 
      ['Izin', 'Sakit', 'Alfa'].includes(a.status)
    ).length;

    setOverallStats({
      totalMeetings,
      totalAttendance,
      averageAttendance: totalMeetings > 0 
        ? Math.round(totalAttendance / totalMeetings) 
        : 0,
      overallHadirRate: totalAttendance > 0 
        ? Math.round((hadir / totalAttendance) * 100) 
        : 0,
      overallLateRate: totalAttendance > 0 
        ? Math.round((late / totalAttendance) * 100) 
        : 0,
      overallAbsenceRate: totalAttendance > 0 
        ? Math.round((absence / totalAttendance) * 100) 
        : 0,
      totalMembers: members?.length || 0
    });
  };

  const fetchMemberPerformance = async () => {
    let profilesQuery = supabase
      .from('user_profiles')
      .select('name, division')
      .order('name');

    if (selectedDivision !== 'all') {
      profilesQuery = profilesQuery.eq('division', selectedDivision);
    }

    let attendanceQuery = supabase
      .from('attendance')
      .select('name, division, status, meeting:meetings!inner(date)');

    if (timeRange !== 'all') {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeRange));
      attendanceQuery = attendanceQuery.gte('meetings.date', startDate.toISOString().split('T')[0]);
    }

    if (selectedDivision !== 'all') {
      attendanceQuery = attendanceQuery.eq('division', selectedDivision);
    }

    const [{ data: profiles, error: profilesError }, { data: attendance, error: attendanceError }] = await Promise.all([
      profilesQuery,
      attendanceQuery
    ]);

    if (profilesError) throw profilesError;
    if (attendanceError) throw attendanceError;

    // Also fetch special event attendance (no time/division filter — always include)
    const { data: specialAtt } = await supabase
      .from('special_event_attendance')
      .select('name, division, status, special_events(event_type, date)');

    const members = new Map<string, MemberPerformance>();

    (profiles || []).forEach((profile) => {
      const normDiv = normalizeDivision(profile.division);
      const key = `${normDiv}-${profile.name}`;
      members.set(key, {
        name: profile.name,
        division: normDiv,
        totalRecords: 0,
        hadir: 0,
        late: 0,
        izin: 0,
        sakit: 0,
        alfa: 0,
        attendanceRate: 0
      });
    });

    (attendance || []).forEach((record) => {
      const normDiv = normalizeDivision(record.division);
      const key = `${normDiv}-${record.name}`;
      let member = members.get(key);

      if (!member) {
        member = {
          name: record.name,
          division: normDiv,
          totalRecords: 0,
          hadir: 0,
          late: 0,
          izin: 0,
          sakit: 0,
          alfa: 0,
          attendanceRate: 0
        };
        members.set(key, member);
      }

      member.totalRecords++;
      if (record.status === 'Hadir') member.hadir++;
      if (record.status === 'Late') member.late++;
      if (record.status === 'Izin') member.izin++;
      if (record.status === 'Sakit') member.sakit++;
      if (record.status === 'Alfa') member.alfa++;
    });

    // Merge special event attendance into member records
    (specialAtt || []).forEach((record: any) => {
      const normDiv = normalizeDivision(record.division);
      const key = `${normDiv}-${record.name}`;
      let member = members.get(key);

      if (!member) {
        member = {
          name: record.name,
          division: normDiv,
          totalRecords: 0,
          hadir: 0,
          late: 0,
          izin: 0,
          sakit: 0,
          alfa: 0,
          attendanceRate: 0
        };
        members.set(key, member);
      }

      member.totalRecords++;
      if (record.status === 'Hadir') member.hadir++;
      if (record.status === 'Izin') member.izin++;
      if (record.status === 'Sakit') member.sakit++;
      if (record.status === 'Alfa') member.alfa++;
    });

    const performance = Array.from(members.values())
      .map((member) => ({
        ...member,
        attendanceRate: member.totalRecords > 0
          ? Math.round(((member.hadir + member.late) / member.totalRecords) * 100)
          : 0
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate || a.name.localeCompare(b.name));

    setMemberPerformance(performance);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(59, 130, 246);
    doc.text('CSSA Analytics Report', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, pageWidth / 2, 28, { align: 'center' });

    // Summary Stats
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Overall Statistics', 14, 40);
    
    const summaryData = [
      ['Total Meetings', overallStats.totalMeetings.toString()],
      ['Total Attendance Records', overallStats.totalAttendance.toString()],
      ['Average Attendance per Meeting', overallStats.averageAttendance.toString()],
      ['Hadir Rate', `${overallStats.overallHadirRate}%`],
      ['Late Rate', `${overallStats.overallLateRate}%`],
      ['Absence Rate', `${overallStats.overallAbsenceRate}%`]
    ];

    autoTable(doc, {
      startY: 45,
      head: [['Metric', 'Value']],
      body: summaryData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 }
    });

    // Meeting Performance
    let finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text('Meeting Performance', 14, finalY);

    const meetingData = meetingStats.slice(0, 10).map(m => [
      m.title,
      format(new Date(m.date), 'dd MMM yyyy'),
      m.totalAttendance.toString(),
      m.hadir.toString(),
      m.late.toString(),
      m.izin.toString(),
      `${m.attendanceRate}%`
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Meeting', 'Date', 'Total', 'Hadir', 'Late', 'Izin', 'Rate']],
      body: meetingData,
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] },
      margin: { left: 14, right: 14 }
    });

// Division Performance
    finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text('Division Performance', 14, finalY);

    // Sort divisions according to DIVISIONS array order
    const divisionOrder = DIVISIONS.reduce((acc, div, index) => {
      acc[div] = index;
      return acc;
    }, {} as Record<string, number>);

    const sortedDivisionStats = [...divisionStats].sort((a, b) => {
      const orderA = divisionOrder[a.division] !== undefined ? divisionOrder[a.division] : 999;
      const orderB = divisionOrder[b.division] !== undefined ? divisionOrder[b.division] : 999;
      return orderA - orderB;
    });

    const divisionData = sortedDivisionStats.map(d => [
      d.division,
      d.totalMembers.toString(),
      d.totalAttendance.toString(),
      `${d.hadirRate}%`,
      `${d.lateRate}%`,
      `${d.absenceRate}%`
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Division', 'Members', 'Attendance', 'Hadir', 'Late', 'Absence']],
      body: divisionData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      margin: { left: 14, right: 14 }
    });

// Member-level totals make the exported report usable for individual follow-up.
    finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.text('Member Performance', 14, finalY);

    const membersByDivision = new Map<string, MemberPerformance[]>();
    memberPerformance.forEach(member => {
      if (!membersByDivision.has(member.division)) {
        membersByDivision.set(member.division, []);
      }
      membersByDivision.get(member.division)!.push(member);
    });

    // Sort divisions according to DIVISIONS array order
    const sortedDivisions = Array.from(membersByDivision.keys()).sort((a, b) => {
      const orderA = divisionOrder[a] !== undefined ? divisionOrder[a] : 999;
      const orderB = divisionOrder[b] !== undefined ? divisionOrder[b] : 999;
      return orderA - orderB;
    });

    // Build member data grouped by division with division headers
    const memberData: (string[] | { type: 'header'; content: string })[] = [];
    
    sortedDivisions.forEach((division, divIndex) => {
      const members = membersByDivision.get(division)!;
      // Sort members within division by name
      members.sort((a, b) => a.name.localeCompare(b.name));
      
      // Add division header row
      memberData.push({ type: 'header', content: division });
      
      members.forEach((member) => {
        memberData.push([
          member.name,
          member.division,
          member.totalRecords.toString(),
          member.hadir.toString(),
          member.late.toString(),
          member.izin.toString(),
          member.sakit.toString(),
          member.alfa.toString(),
          `${member.attendanceRate}%`
        ]);
      });
    });

    // Also include members from divisions not in DIVISIONS array
    const otherDivisions = Array.from(membersByDivision.keys()).filter(d => !DIVISIONS.includes(d));
    otherDivisions.forEach(division => {
      const members = membersByDivision.get(division)!;
      members.sort((a, b) => a.name.localeCompare(b.name));
      
      memberData.push({ type: 'header', content: division });
      
      members.forEach((member) => {
        memberData.push([
          member.name,
          member.division,
          member.totalRecords.toString(),
          member.hadir.toString(),
          member.late.toString(),
          member.izin.toString(),
          member.sakit.toString(),
          member.alfa.toString(),
          `${member.attendanceRate}%`
        ]);
      });
    });

    // Convert to format autoTable expects with custom styling for division headers
    const tableBody = memberData.map((row): RowInput => {
      if (typeof row === 'object' && 'type' in row && row.type === 'header') {
        return [{
          content: row.content,
          colSpan: 9,
          styles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255],
            fontStyle: 'bold' as const,
            fontSize: 8,
            halign: 'left'
          }
        }];
      }
      return row;
    });

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Member', 'Division', 'Total', 'Hadir', 'Late', 'Izin', 'Sakit', 'Alfa', 'Rate']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 7 },
      margin: { left: 8, right: 8 },
      columnStyles: {
        0: { fontStyle: 'normal' }
      }
    });

    doc.save(`CSSA_Analytics_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportToCSV = () => {
    // Export Meeting Stats
    const meetingHeaders = ['Meeting', 'Date', 'Total Attendance', 'Hadir', 'Late', 'Izin', 'Sakit', 'Alfa', 'Attendance Rate'];
    const meetingRows = meetingStats.map(m => [
      m.title,
      m.date,
      m.totalAttendance,
      m.hadir,
      m.late,
      m.izin,
      m.sakit,
      m.alfa,
      `${m.attendanceRate}%`
    ]);

    const meetingCSV = [meetingHeaders, ...meetingRows]
      .map(row => row.join(','))
      .join('\n');

    const meetingBlob = new Blob([meetingCSV], { type: 'text/csv' });
    const meetingUrl = URL.createObjectURL(meetingBlob);
    const meetingLink = document.createElement('a');
    meetingLink.href = meetingUrl;
    meetingLink.setAttribute('download', `meeting_stats_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(meetingLink);
    meetingLink.click();
    document.body.removeChild(meetingLink);

    // Export Division Stats
    const divHeaders = ['Division', 'Total Members', 'Total Attendance', 'Avg Attendance', 'Hadir Rate', 'Late Rate', 'Absence Rate'];
    const divRows = divisionStats.map(d => [
      d.division,
      d.totalMembers,
      d.totalAttendance,
      d.averageAttendance,
      `${d.hadirRate}%`,
      `${d.lateRate}%`,
      `${d.absenceRate}%`
    ]);

    const divCSV = [divHeaders, ...divRows]
      .map(row => row.join(','))
      .join('\n');

    const divBlob = new Blob([divCSV], { type: 'text/csv' });
    const divUrl = URL.createObjectURL(divBlob);
    const divLink = document.createElement('a');
    divLink.href = divUrl;
    divLink.setAttribute('download', `division_stats_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(divLink);
    divLink.click();
    document.body.removeChild(divLink);
  };

  const getInsights = () => {
    const insights = [];
    
    // Best performing meeting
    if (meetingStats.length > 0) {
      const bestMeeting = meetingStats.reduce((prev, current) => 
        (current.attendanceRate > prev.attendanceRate) ? current : prev
      );
      insights.push({
        type: 'success',
        title: 'Best Attendance',
        description: `${bestMeeting.title} had the highest attendance rate at ${bestMeeting.attendanceRate}%`,
        icon: Award
      });
    }

    // Division with best attendance
    if (divisionStats.length > 0) {
      const bestDiv = divisionStats[0];
      insights.push({
        type: 'success',
        title: 'Top Division',
        description: `${bestDiv.division} has the best attendance rate at ${bestDiv.hadirRate}%`,
        icon: Target
      });
    }

    // Alert if absence rate is high
    if (overallStats.overallAbsenceRate > 20) {
      insights.push({
        type: 'warning',
        title: 'High Absence Rate',
        description: `Overall absence rate is ${overallStats.overallAbsenceRate}%. Consider implementing engagement strategies.`,
        icon: AlertCircle
      });
    }

    // Trend insight
    if (timeSeriesData.length >= 2) {
      const recent = timeSeriesData.slice(-3);
      const prev = timeSeriesData.slice(-6, -3);
      const recentAvg = recent.reduce((sum, d) => sum + d.attendance, 0) / recent.length;
      const prevAvg = prev.reduce((sum, d) => sum + d.attendance, 0) / prev.length;
      
      if (recentAvg > prevAvg * 1.1) {
        insights.push({
          type: 'success',
          title: 'Positive Trend',
          description: 'Attendance has increased by over 10% in recent meetings',
          icon: TrendingUp
        });
      } else if (recentAvg < prevAvg * 0.9) {
        insights.push({
          type: 'warning',
          title: 'Declining Trend',
          description: 'Attendance has decreased in recent meetings',
          icon: TrendingDown
        });
      }
    }

    return insights;
  };

  const insights = getInsights();
  const filteredMemberPerformance = memberPerformance.filter((member) =>
    member.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    member.division.toLowerCase().includes(memberSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Analytics Dashboard
            </h1>
            <p className="text-slate-500 mt-1">Comprehensive insights and attendance analytics</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Time Range Filter */}
            <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-slate-200">
              {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    timeRange === range
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {range === '7d' ? 'Last 7 days' : 
                   range === '30d' ? 'Last 30 days' : 
                   range === '90d' ? 'Last 90 days' : 'All time'}
                </button>
              ))}
            </div>

            {/* Division Filter */}
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Divisions</option>
              {DIVISIONS.map(div => (
                <option key={div} value={div}>{div}</option>
              ))}
            </select>

            {/* Export Buttons */}
            <button
              onClick={exportToPDF}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-all"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-all"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-blue-50">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-slate-500">Total Meetings</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{overallStats.totalMeetings}</p>
            <p className="text-sm text-slate-500 mt-1">
              {timeRange === 'all' ? 'All time' : `Last ${timeRange}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-green-50">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-xs font-medium text-slate-500">Avg Attendance</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{overallStats.averageAttendance}</p>
            <p className="text-sm text-slate-500 mt-1">
              {overallStats.overallHadirRate}% Hadir rate
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-yellow-50">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <span className="text-xs font-medium text-slate-500">Late Rate</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{overallStats.overallLateRate}%</p>
            <p className="text-sm text-slate-500 mt-1">
              {overallStats.totalAttendance} total records
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-red-50">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <span className="text-xs font-medium text-slate-500">Absence Rate</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{overallStats.overallAbsenceRate}%</p>
            <p className="text-sm text-slate-500 mt-1">
              {overallStats.totalMembers} registered members
            </p>
          </div>
        </div>

        {/* Special Events Summary */}
        {specialEventStats.totalEvents > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-xl">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Kegiatan Khusus</h3>
                <p className="text-xs text-slate-500">Study Bible &amp; Doa Subuh</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-purple-100">
                <p className="text-2xl font-black text-purple-700">{specialEventStats.totalEvents}</p>
                <p className="text-xs text-slate-500 mt-1">Total Kegiatan</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-blue-100">
                <p className="text-2xl font-black text-blue-700">{specialEventStats.totalStudyBible}</p>
                <p className="text-xs text-slate-500 mt-1">Study Bible</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-amber-100">
                <p className="text-2xl font-black text-amber-700">{specialEventStats.totalDoaSubuh}</p>
                <p className="text-xs text-slate-500 mt-1">Doa Subuh</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-green-100">
                <p className="text-2xl font-black text-green-700">{specialEventStats.overallHadirRate}%</p>
                <p className="text-xs text-slate-500 mt-1">Rate Kehadiran</p>
              </div>
            </div>
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`rounded-2xl p-6 border shadow-sm ${
                  insight.type === 'success'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    insight.type === 'success' ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    <insight.icon className={`w-5 h-5 ${
                      insight.type === 'success' ? 'text-green-600' : 'text-yellow-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-sm ${
                      insight.type === 'success' ? 'text-green-900' : 'text-yellow-900'
                    }`}>
                      {insight.title}
                    </h3>
                    <p className={`text-xs mt-1 ${
                      insight.type === 'success' ? 'text-green-700' : 'text-yellow-700'
                    }`}>
                      {insight.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Attendance Trend */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Attendance Trend
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="attendance" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fill="url(#colorAttendance)"
                  name="Total Attendance"
                />
                <Area 
                  type="monotone" 
                  dataKey="hadir" 
                  stroke="#22c55e" 
                  strokeWidth={2}
                  fill="none"
                  name="Hadir"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Status Distribution */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-purple-600" />
                Overall Status Distribution
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Hadir', value: meetingStats.reduce((sum, m) => sum + m.hadir, 0) },
                    { name: 'Late', value: meetingStats.reduce((sum, m) => sum + m.late, 0) },
                    { name: 'Izin', value: meetingStats.reduce((sum, m) => sum + m.izin, 0) },
                    { name: 'Sakit', value: meetingStats.reduce((sum, m) => sum + m.sakit, 0) },
                    { name: 'Alfa', value: meetingStats.reduce((sum, m) => sum + m.alfa, 0) }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  <Cell fill={COLORS.hadir} />
                  <Cell fill={COLORS.late} />
                  <Cell fill={COLORS.izin} />
                  <Cell fill={COLORS.sakit} />
                  <Cell fill={COLORS.alfa} />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Division Performance */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                Division Performance
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={divisionStats} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis 
                  dataKey="division" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 11}} 
                  width={100}
                />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                />
                <Legend />
                <Bar dataKey="hadirRate" name="Hadir %" fill={COLORS.hadir} radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="lateRate" name="Late %" fill={COLORS.late} radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="absenceRate" name="Absence %" fill={COLORS.alfa} radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Meeting Performance */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                Meeting Performance
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={meetingStats.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="title" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 10}} angle={-45} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                />
                <Bar dataKey="attendanceRate" name="Attendance Rate %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Tables */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Performa Anggota</h3>
              <p className="text-sm text-slate-500 mt-1">Rekap presensi setiap anggota pada periode yang dipilih</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Cari nama atau divisi"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">Anggota</th>
                  <th className="px-6 py-3 text-left">Divisi</th>
                  <th className="px-6 py-3 text-center">Total</th>
                  <th className="px-6 py-3 text-center text-green-600">Hadir</th>
                  <th className="px-6 py-3 text-center text-yellow-600">Late</th>
                  <th className="px-6 py-3 text-center text-blue-600">Izin</th>
                  <th className="px-6 py-3 text-center text-purple-600">Sakit</th>
                  <th className="px-6 py-3 text-center text-red-600">Alfa</th>
                  <th className="px-6 py-3 text-center">Kehadiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMemberPerformance.map((member) => (
                  <tr key={`${member.division}-${member.name}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{member.name}</td>
                    <td className="px-6 py-4 text-slate-500">{member.division}</td>
                    <td className="px-6 py-4 text-center text-slate-700">{member.totalRecords}</td>
                    <td className="px-6 py-4 text-center text-green-600 font-medium">{member.hadir}</td>
                    <td className="px-6 py-4 text-center text-yellow-600 font-medium">{member.late}</td>
                    <td className="px-6 py-4 text-center text-blue-600 font-medium">{member.izin}</td>
                    <td className="px-6 py-4 text-center text-purple-600 font-medium">{member.sakit}</td>
                    <td className="px-6 py-4 text-center text-red-600 font-medium">{member.alfa}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        member.attendanceRate >= 80
                          ? 'bg-green-100 text-green-700'
                          : member.attendanceRate >= 60
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {member.attendanceRate}%
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredMemberPerformance.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center text-slate-500">Tidak ada anggota yang sesuai.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Meeting Details</h3>
            <span className="text-sm text-slate-500">{meetingStats.length} meetings</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 text-left">Meeting</th>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-center">Total</th>
                  <th className="px-6 py-3 text-center text-green-600">Hadir</th>
                  <th className="px-6 py-3 text-center text-yellow-600">Late</th>
                  <th className="px-6 py-3 text-center text-blue-600">Izin</th>
                  <th className="px-6 py-3 text-center text-purple-600">Sakit</th>
                  <th className="px-6 py-3 text-center text-red-600">Alfa</th>
                  <th className="px-6 py-3 text-center">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {meetingStats.map((meeting) => (
                  <tr key={meeting.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{meeting.title}</td>
                    <td className="px-6 py-4 text-slate-500">{format(new Date(meeting.date), 'dd MMM yyyy')}</td>
                    <td className="px-6 py-4 text-center text-slate-700">{meeting.totalAttendance}</td>
                    <td className="px-6 py-4 text-center text-green-600 font-medium">{meeting.hadir}</td>
                    <td className="px-6 py-4 text-center text-yellow-600 font-medium">{meeting.late}</td>
                    <td className="px-6 py-4 text-center text-blue-600 font-medium">{meeting.izin}</td>
                    <td className="px-6 py-4 text-center text-purple-600 font-medium">{meeting.sakit}</td>
                    <td className="px-6 py-4 text-center text-red-600 font-medium">{meeting.alfa}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        meeting.attendanceRate >= 80
                          ? 'bg-green-100 text-green-700'
                          : meeting.attendanceRate >= 60
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {meeting.attendanceRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
