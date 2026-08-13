'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertOctagon, ScanLine, Camera, XCircle, Loader2 } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function AttendBarcode({ params }: { params: { meetingId: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<string | null>(null);
  const [attendanceResult, setAttendanceResult] = useState<{name: string, division: string, status: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    // SECURITY: Clear admin session
    localStorage.removeItem('cssa_admin_auth');
  }, []);

  useEffect(() => {
    if (showScanner && !scannerRef.current) {
      hasScannedRef.current = false;
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 300, height: 150 },
          supportedScanTypes: [] // Supports 1D (Barcode) and 2D (QR)
        },
        false
      );

      scannerRef.current.render((decodedText) => {
        if (!hasScannedRef.current) {
          hasScannedRef.current = true; // Prevent double scanning
          stopScanner();
          handleScanSubmit(decodedText);
        }
      }, (err) => {
        // scan errors are noisy
      });
    }

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanner]);

  const startScanner = () => {
    setError(null);
    setShowScanner(true);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(e => console.error("Failed to clear scanner", e));
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

  const handleScanSubmit = async (noreg: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: params.meetingId,
          token,
          noreg: noreg.trim()
        })
      });

      const data = await res.json();

      if (res.ok) {
        setAttendanceResult({
          name: data.name,
          division: data.division,
          status: data.status
        });
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        setError(data.error || 'Terjadi kesalahan. Silakan coba lagi.');
        setTimeout(() => setShowScanner(true), 2000); // restart scanner after showing error
      }
    } catch (err) {
      setError('Koneksi gagal. Periksa internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-6 text-center text-white">
        <AlertOctagon size={48} className="text-red-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">Akses Tidak Sah</h1>
        <p className="text-slate-400">Silakan scan kode QR pertemuan yang disediakan oleh Admin.</p>
      </div>
    );
  }

  if (attendanceResult || status) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex flex-col items-center justify-center text-white text-center p-6">
        <div className="animate-bounce mb-8">
          <CheckCircle size={100} className="text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.5)]" />
        </div>
        <h1 className="text-5xl font-black mb-4 tracking-tight">BERHASIL</h1>
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
          <p className="text-3xl font-bold text-white mb-2">{attendanceResult?.status || 'Hadir'}</p>
          <div className="h-px bg-white/20 w-full mb-4"></div>
          <p className="text-white/70 text-sm uppercase tracking-widest font-bold mb-1">Identitas Terverifikasi</p>
          <p className="text-2xl font-bold text-emerald-300">{attendanceResult?.name}</p>
          <p className="text-white/50 text-xs mt-1">{attendanceResult?.division}</p>
        </div>
        <button onClick={() => {
          setStatus(null);
          setAttendanceResult(null);
          startScanner();
        }} className="mt-12 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full font-bold transition-all border border-white/20">
          Scan Peserta Berikutnya
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative text-center">
          
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="animate-spin text-blue-400 w-16 h-16 mb-6" />
              <p className="text-white font-semibold text-lg">Memproses Kehadiran...</p>
              <p className="text-blue-300/60 text-sm mt-2">Mencocokkan No Registrasi</p>
            </div>
          ) : showScanner ? (
            <div className="flex flex-col items-center animate-fade-in-up">
              <div className="flex justify-between w-full mb-4 items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Camera size={20} className="text-blue-400" />Scan Barcode ID</h2>
                <button onClick={stopScanner} className="text-slate-400 hover:text-red-400 transition"><XCircle size={24} /></button>
              </div>

              <div className="w-full mb-4 border border-blue-500/30 rounded-2xl overflow-hidden bg-black p-2 relative shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                <div id="reader" className="w-full"></div>
                <style jsx global>{`
                  #reader { width: 100%; border: none; }
                  #reader video { border-radius: 1rem; object-fit: cover; }
                  #reader__dashboard_section_csr { padding: 10px; color: white !important; }
                  #reader__dashboard_section_csr button { background: #3b82f6; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; }
                `}</style>
              </div>

              <p className="text-blue-200/70 text-xs mt-2 animate-pulse">Arahkan garis merah ke Barcode No Registrasi pada ID Card</p>
            </div>
          ) : (
            <>
              <div className="inline-block p-4 rounded-full bg-blue-500/10 mb-6 border border-blue-500/20">
                <ScanLine className="text-blue-400 w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Presensi CSSA</h1>
              <p className="text-sm text-blue-200/60 mt-2 mb-8">Scan Barcode ID Card Peserta</p>

              {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-left">
                  <div className="flex items-center gap-2 text-red-400 mb-1">
                    <AlertOctagon size={18} />
                    <span className="font-bold text-sm">Gagal</span>
                  </div>
                  <p className="text-red-300/80 text-xs leading-relaxed">{error}</p>
                </div>
              )}

              <button 
                onClick={startScanner} 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                <Camera size={24} /> Buka Kamera Scanner
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
