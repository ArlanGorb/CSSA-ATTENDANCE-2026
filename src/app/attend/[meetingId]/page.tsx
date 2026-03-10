'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertOctagon, ScanLine } from 'lucide-react';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan", 
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

export default function MemberAttendance({ params }: { params: { meetingId: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center text-white overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[100px] animate-pulse delay-700"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-8 relative group">
            <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000 animate-pulse rounded-full"></div>
            <div className="bg-white/5 p-8 rounded-full backdrop-blur-xl border border-white/10 shadow-2xl relative animate-bounce">
              <ScanLine size={64} className="text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 animate-pulse bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-white to-blue-200 text-center px-4">
            PRESENSI CSSA 26
          </h1>
          
          <div className="flex items-center space-x-3 text-blue-200/60 mt-6 bg-white/5 px-4 py-2 rounded-full border border-white/5 backdrop-blur-sm">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </div>
            <p className="text-xs tracking-[0.2em] font-medium text-blue-300">SYSTEM INITIALIZING</p>
          </div>
        </div>
        
        <div className="absolute bottom-8 text-[10px] text-white/20 tracking-widest uppercase">
          Powered by BEM FILKOM
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);
    
    const form = e.target as HTMLFormElement;

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: params.meetingId,
          token,
          name: form.memberName.value,
          division: form.division.value,
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <AlertOctagon size={48} className="text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Access</h1>
        <p className="text-gray-500">Please scan the QR code provided by the Admin.</p>
      </div>
    );
  }

  if (status) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex flex-col items-center justify-center text-white overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px] animate-pulse delay-1000"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
            <div className="mb-8 relative">
                <div className="absolute inset-0 bg-green-500 blur-2xl opacity-30 animate-ping rounded-full duration-[3000ms]"></div>
                <div className="bg-white/10 p-8 rounded-full backdrop-blur-xl border border-white/20 shadow-[0_0_50px_rgba(16,185,129,0.5)] relative animate-[bounce_2s_infinite]">
                    <CheckCircle size={80} className="text-green-400 drop-shadow-lg" />
                </div>
            </div>

            <h1 className="text-5xl font-bold tracking-tight mb-4 animate-[slideUp_0.8s_ease-out] bg-clip-text text-transparent bg-gradient-to-r from-green-200 via-white to-green-200 text-center">
                ACCESS GRANTED
            </h1>
            
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-6 max-w-xs w-full mx-4 text-center transform transition-all duration-500 hover:scale-105">
                 <p className="text-emerald-200 text-sm font-medium uppercase tracking-widest mb-2">Status</p>
                 <p className="text-2xl font-bold text-white mb-1">{status}</p>
                 <div className="h-1 w-16 bg-green-500/50 mx-auto rounded-full mt-4 mb-2"></div>
                 <p className="text-white/60 text-xs mt-2">Your attendance has been verified.</p>
            </div>

            <div className="mt-12 opacity-0 animate-[fadeIn_1s_ease-out_1s_forwards]">
                <p className="text-emerald-400/60 text-sm tracking-[0.2em] font-light uppercase">You may close this window</p>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10">
          <div className="text-center mb-8">
             <div className="inline-block p-3 rounded-full bg-blue-500/20 mb-4 ring-1 ring-blue-400/30">
                <ScanLine className="text-blue-400 w-8 h-8" />
             </div>
             <h1 className="text-3xl font-bold text-white tracking-tight">CSSA Presence</h1>
             <p className="text-sm text-blue-200/60 mt-2 font-light tracking-wide">Enter your details to clock in.</p>
          </div>
          
          {error && (
            <div className="bg-red-500/10 text-red-200 p-4 rounded-xl text-sm mb-6 flex items-start gap-3 border border-red-500/20 animate-pulse">
              <AlertOctagon size={18} className="mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="group">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2 ml-1">Full Name</label>
              <input 
                name="memberName" 
                required 
                className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 group-hover:border-blue-500/30" 
                placeholder="e.g. John Doe" 
              />
            </div>
            
            <div className="group">
              <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2 ml-1">Division</label>
              <div className="relative">
                <select 
                  name="division" 
                  required 
                  className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none appearance-none transition-all group-hover:border-blue-500/30"
                >
                  <option value="" className="bg-slate-900 text-slate-400">Select Division...</option>
                  {DIVISIONS.map(div => <option key={div} value={div} className="bg-slate-900">{div}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Submit Attendance</span>
                  <CheckCircle size={18} />
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="text-center text-slate-500 text-xs mt-8">
          &copy; 2026 CSSA BEM FILKOM. All rights reserved.
        </p>
      </div>
    </div>
  );
}
