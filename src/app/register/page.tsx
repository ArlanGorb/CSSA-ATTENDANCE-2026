'use client';
import { useState, useEffect, useRef } from 'react';
import { Camera, XCircle, UserPlus, ArrowLeft, Loader2, Barcode, CheckCircle, AlertOctagon } from 'lucide-react';
import Link from 'next/link';
import { Html5QrcodeScanner } from 'html5-qrcode';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

export default function RegisterMember() {
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [noreg, setNoreg] = useState('');
  
  const [showScanner, setShowScanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (showScanner) {
      // Initialize the scanner
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 100 },
          videoConstraints: { facingMode: "environment" }
        },
        false
      );

      scannerRef.current.render((decodedText) => {
        setNoreg(decodedText);
        stopScanner();
      }, (error) => {
        // scan errors are noisy, ignore them
      });
    }

    return () => {
      stopScanner();
    };
  }, [showScanner]);

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(e => console.error("Failed to clear scanner", e));
      scannerRef.current = null;
    }
    setShowScanner(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !division || !noreg) {
      setError("Semua field wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          division,
          noreg: noreg.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Gagal menyimpan profil.');
      }
    } catch (err) {
      setError('Kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="bg-white/5 border border-white/10 p-8 rounded-3xl max-w-md w-full text-center backdrop-blur-xl">
          <CheckCircle className="w-20 h-20 text-emerald-400 mx-auto mb-4 animate-bounce" />
          <h1 className="text-3xl font-bold text-white mb-2">Registrasi Berhasil!</h1>
          <p className="text-slate-400 mb-6">Profil {name} dengan No. Registrasi {noreg} telah tersimpan.</p>
          
          <div className="flex gap-4">
            <button
              onClick={() => {
                setSuccess(false);
                setName('');
                setDivision('');
                setNoreg('');
              }}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold transition-all"
            >
              Daftar Lagi
            </button>
            <Link href="/" className="flex-1 bg-violet-600 hover:bg-violet-500 text-white py-3 rounded-xl font-bold transition-all">
              Selesai
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10">
          <div className="text-center mb-8">
            <div className="inline-block p-3 rounded-full bg-violet-500/20 mb-4 ring-1 ring-violet-400/30">
              <UserPlus className="text-violet-400 w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Daftar Anggota</h1>
            <p className="text-sm text-violet-200/60 mt-2 font-light tracking-wide">Daftarkan No Registrasi (Barcode) Anda.</p>
          </div>

          {error && (
            <div className="bg-red-500/10 text-red-200 p-4 rounded-xl text-sm mb-6 flex items-start gap-3 border border-red-500/20">
              <AlertOctagon size={18} className="mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="group">
              <label className="block text-xs font-semibold text-violet-300 uppercase mb-2">Nama Lengkap</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                placeholder="Contoh: John Doe"
              />
            </div>

            <div className="group">
              <label className="block text-xs font-semibold text-violet-300 uppercase mb-2">Divisi</label>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none appearance-none transition-all"
              >
                <option value="" disabled>Pilih Divisi</option>
                {DIVISIONS.map(div => (
                  <option key={div} value={div} className="bg-slate-800">{div}</option>
                ))}
              </select>
            </div>

            <div className="group">
              <label className="block text-xs font-semibold text-violet-300 uppercase mb-2">No Registrasi (Barcode)</label>
              <div className="flex gap-2">
                <input
                  value={noreg}
                  onChange={(e) => setNoreg(e.target.value)}
                  required
                  className="flex-1 bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                  placeholder="Scan atau ketik NOREG"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(!showScanner)}
                  className="bg-violet-600 hover:bg-violet-500 text-white p-4 rounded-xl transition-all"
                  title="Scan Barcode"
                >
                  <Camera size={24} />
                </button>
              </div>
            </div>

            {showScanner && (
              <div className="mt-4 border border-violet-500/30 rounded-xl overflow-hidden bg-black p-2 relative">
                <div className="flex justify-between items-center mb-2 px-2">
                  <span className="text-violet-300 text-xs font-bold uppercase">Arahkan Kamera ke Barcode</span>
                  <button type="button" onClick={stopScanner} className="text-red-400"><XCircle size={18} /></button>
                </div>
                <div id="reader" className="w-full"></div>
                <style jsx global>{`
                  #reader { width: 100%; border: none; }
                  #reader video { border-radius: 0.5rem; object-fit: cover; }
                  #reader__dashboard_section_csr { padding: 10px; }
                `}</style>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2 mt-4 
                ${submitting ? 'bg-slate-700 text-slate-400' : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white'}`}
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              {submitting ? 'Menyimpan...' : 'Daftarkan Anggota'}
            </button>
          </form>

          <Link href="/" className="flex items-center justify-center gap-2 mt-6 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft size={16} /> Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
