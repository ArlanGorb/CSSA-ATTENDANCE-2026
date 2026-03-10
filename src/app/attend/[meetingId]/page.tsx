'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertOctagon, ScanLine, Camera, XCircle } from 'lucide-react';
import fpPromise from '@fingerprintjs/fingerprintjs';

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

  // Biometric / Camera States
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');
  const [showBreachAlert, setShowBreachAlert] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    
    // Initialize Fingerprint
    const initFingerprint = async () => {
      const fp = await fpPromise.load();
      const result = await fp.get();
      setDeviceId(result.visitorId);
    };
    initFingerprint();

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

  const handleFormNext = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    setFormData({
      name: form.memberName.value,
      division: form.division.value,
    });
    startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setShowCamera(true);
      setError(null);
      // Let the video element render before assigning stream
      setTimeout(() => {
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      }, 100);
    } catch (err) {
      setError("Camera access is required for Face Scan to verify your attendance.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
    setScanning(false);
  };

  const handleScan = () => {
    setScanning(true);
    // Simulate biometric processing time
    setTimeout(() => {
      stopCamera();
      executeAttendanceSubmit();
    }, 3000);
  };

  const executeAttendanceSubmit = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: params.meetingId,
          token,
          name: formData.name,
          division: formData.division,
          deviceId: deviceId, // Send device fingerprint
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        // If the error message mentions multiple submissions from this device or user
        if (data.error.includes("already submitted")) {
            setShowBreachAlert(true);
        } else {
            setError(data.error);
        }
        setShowCamera(false); // Go back to form or show error clearly
        setScanning(false);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setShowCamera(false);
      setScanning(false);
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

  if (showBreachAlert) {
    return (
      <div className="fixed inset-0 z-50 bg-red-950 flex flex-col items-center justify-center text-white overflow-hidden">
        {/* Sirens/Alarms */}
        <div className="absolute inset-0 bg-red-600/20 animate-[pulse_0.5s_infinite]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200vw] h-[200vw] bg-[radial-gradient(circle,rgba(255,0,0,0.8)_0%,transparent_70%)] opacity-30 animate-ping"></div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <AlertOctagon size={100} className="text-red-500 mb-6 drop-shadow-[0_0_30px_rgba(239,68,68,1)] animate-bounce" />
          <h1 className="text-6xl font-black tracking-widest text-red-500 mb-2 uppercase" style={{ textShadow: '0 0 20px red' }}>
            SECURITY BREACH
          </h1>
          <p className="text-xl text-red-300 font-mono tracking-wide uppercase max-w-md bg-black/50 p-4 border border-red-500/50 mt-4 rounded-lg">
            Multiple check-ins detected <br/> from a single device footprint.
          </p>
          <div className="mt-12 text-sm text-red-400 font-mono flex items-center gap-2 opacity-70">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
            INCIDENT LOGGED [DEVICE_ID: {deviceId.substring(0,8)}...]
          </div>
        </div>
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
        <style>{`
          @keyframes scanLine {
            0%, 100% { top: 0%; }
            50% { top: 96%; }
          }
          .animate-scan-line {
            animation: scanLine 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          }
        `}</style>
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">
          
          {showCamera ? (
            <div className="flex flex-col items-center animate-[fadeIn_0.3s_ease-out]">
                <div className="flex justify-between w-full mb-4 items-center">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <Camera size={20} className="text-blue-400" />
                        Live Face Verify
                    </h2>
                    <button onClick={stopCamera} className="text-slate-400 hover:text-red-400 transition" type="button">
                        <XCircle size={24} />
                    </button>
                </div>
                
                <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black mb-6 ring-2 ring-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className={`w-full h-full object-cover transition-all duration-700 ${scanning ? 'filter sepia-[0.3] hue-rotate-[180deg] saturate-[3] contrast-[1.5]' : ''}`}
                    />
                    
                    {/* Scanner Effect */}
                    {scanning && (
                        <>
                            <div className="absolute top-0 left-0 w-full h-2 bg-green-400/80 shadow-[0_0_20px_#4ade80] animate-scan-line z-20"></div>
                            <div className="absolute inset-0 border-4 border-green-500/30 rounded-2xl animate-pulse z-10"></div>
                            <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 backdrop-blur-[2px] z-10">
                                <span className="px-4 py-2 bg-green-500 text-white font-bold tracking-widest rounded-full animate-pulse shadow-lg">ANALYZING...</span>
                            </div>
                        </>
                    )}

                    {/* Face Guide Overlay */}
                    {!scanning && (
                       <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                           <div className="w-48 h-56 border-2 border-dashed border-white/60 rounded-[40%] shadow-[0_0_0_999px_rgba(0,0,0,0.5)]"></div>
                           <div className="absolute bottom-4 text-white/80 text-xs font-bold uppercase tracking-widest bg-black/50 px-3 py-1 rounded">Align Face Here</div>
                       </div>
                    )}
                </div>

                <p className="text-center text-slate-300 text-xs mb-6 px-4">
                   Position your face within the frame to prove your presence.
                </p>

                <button 
                  onClick={handleScan}
                  disabled={scanning}
                  type="button"
                  className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {scanning ? 'Hold Still...' : 'Authenticate'}
                </button>
            </div>
          ) : (
            <>
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
              
              <form onSubmit={handleFormNext} className="space-y-6">
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
                      <span>Proceeding...</span>
                    </>
                  ) : (
                    <>
                      <span>Next: Face Verify</span>
                      <Camera size={18} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
        
        <p className="text-center text-slate-500 text-xs mt-8">
          &copy; 2026 CSSA BEM FILKOM. All rights reserved.
        </p>
      </div>
    </div>
  );
}
