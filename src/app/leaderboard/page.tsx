'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Medal, ArrowLeft, Star, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface MemberScore {
  name: string;
  division: string;
  points: number;
  totalHadir: number;
  totalLate: number;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<MemberScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    const { data: attendances } = await supabase
      .from('attendance')
      .select('name, division, status');

    const scores: Record<string, MemberScore> = {};

    attendances?.forEach((record) => {
      // Normalize name to handle slight variations
      const normalizedName = record.name.trim().toUpperCase();

      if (!scores[normalizedName]) {
        scores[normalizedName] = { 
          name: record.name.trim(), 
          division: record.division, 
          points: 0, 
          totalHadir: 0,
          totalLate: 0
        };
      }
      
      if (record.status === 'Hadir') {
        scores[normalizedName].points += 10;
        scores[normalizedName].totalHadir += 1;
      } else if (record.status === 'Late') {
        scores[normalizedName].points += 5;
        scores[normalizedName].totalLate += 1;
      }
    });

    // Urutkan dari poin terbesar ke terkecil
    const sorted = Object.values(scores).sort((a, b) => b.points - a.points);
    setLeaderboard(sorted);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-3xl mx-auto relative z-10">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors">
            <ArrowLeft size={18} />
            Back to Home
        </Link>

        <div className="text-center mb-12 animate-[fadeIn_0.5s_ease-out]">
            <div className="inline-block p-4 rounded-full bg-yellow-500/10 mb-4 ring-1 ring-yellow-400/30">
                <Trophy className="text-yellow-400 w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 via-yellow-400 to-orange-400 tracking-tight">
                CSSA Leaderboard
            </h1>
            <p className="text-slate-400 mt-3 font-light">Peringkat kedisiplinan dan kehadiran anggota</p>
        </div>

        {loading ? (
            <div className="flex flex-col items-center justify-center p-12">
                <div className="w-10 h-10 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-400 animate-pulse">Menghitung skor...</p>
            </div>
        ) : (
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            {leaderboard.length === 0 ? (
                <div className="p-12 text-center text-slate-400">Belum ada data absensi.</div>
            ) : (
                <div className="flex flex-col">
                {leaderboard.map((member, index) => (
                    <div 
                        key={index} 
                        className={`flex items-center justify-between p-4 md:p-6 border-b border-white/5 hover:bg-white/5 transition-all duration-300 ${
                            index === 0 ? 'bg-yellow-500/10' : ''
                        }`}
                        style={{
                            animation: `slideUp 0.5s ease-out ${index * 0.1}s forwards`,
                            opacity: 0
                        }}
                    >
                        <div className="flex items-center gap-4 md:gap-6">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${
                                index === 0 ? 'text-yellow-400 bg-yellow-400/20' : 
                                index === 1 ? 'text-slate-300 bg-slate-300/20' : 
                                index === 2 ? 'text-amber-500 bg-amber-500/20' : 
                                'text-slate-500 bg-slate-800'
                            }`}>
                                {index + 1}
                            </div>
                            
                            {index === 0 && <Medal className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)] shrink-0 hidden md:block" size={28} />}
                            {index === 1 && <Medal className="text-slate-300 shrink-0 hidden md:block" size={28} />}
                            {index === 2 && <Medal className="text-amber-600 shrink-0 hidden md:block" size={28} />}
                            {index > 2 && <div className="w-7 hidden md:block"></div>}
                            
                            <div>
                                <h3 className="font-bold text-lg text-white capitalize">{member.name.toLowerCase()}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 uppercase tracking-wider">
                                        {member.division}
                                    </span>
                                    <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <CheckCircle size={10} className="text-green-400"/> {member.totalHadir} On-time
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <div className="flex items-center justify-end gap-1 mb-1">
                                <Star className={`${index === 0 ? 'text-yellow-400' : 'text-slate-500'}`} size={14} fill={index === 0 ? 'currentColor' : 'none'} />
                                <span className={`text-2xl md:text-3xl font-black tracking-tighter ${index === 0 ? 'text-yellow-400' : 'text-white'}`}>
                                    {member.points}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Points</p>
                        </div>
                    </div>
                ))}
                </div>
            )}
            </div>
        )}

        <style>{`
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}