import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-900 via-blue-900 to-blue-800 text-white">
      <div className="z-10 max-w-5xl w-full flex flex-col items-center text-center font-sans mb-10">
        <div className="mb-8 p-4 bg-white/10 rounded-full backdrop-blur-sm border border-white/20">
          <span className="text-4xl font-bold tracking-tight">CSSA</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-white">
          BEM FILKOM
        </h1>
        <p className="text-xl md:text-2xl text-blue-200 opacity-90 font-light tracking-wide max-w-2xl">
          Sistem Absensi & Manajemen Pertemuan Terintegrasi di Lingkungan Fakultas Ilmu Komputer.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 mt-8 w-full max-w-4xl justify-center">
        <Link
          href="/admin"
          className="group relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-8 hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
        >
          <div className="relative z-10">
            <h2 className={`mb-3 text-2xl font-bold flex items-center gap-2`}>
              Admin Portal
              <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
            </h2>
            <p className={`m-0 text-sm text-blue-100 opacity-80 max-w-[30ch] leading-relaxed`}>
              Khusus Sekretaris & Operator. Login untuk membuat pertemuan dan scan QR.
            </p>
          </div>
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-500/30 rounded-full blur-2xl group-hover:bg-blue-400/40 transition-all"></div>
        </Link>
      </div>

      <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 text-center opacity-60 text-sm font-light">
        <div>
          <h3 className="text-lg font-bold text-white mb-1">50+</h3>
          <p>Members</p>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Offline</h3>
          <p>Meeting Focus</p>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">QR Code</h3>
          <p>Secure Check-in</p>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">Realtime</h3>
          <p>Monitoring</p>
        </div>
      </div>
      
      <footer className="mt-auto py-8 text-blue-300 text-xs tracking-widest uppercase">
        &copy; {new Date().getFullYear()} Computer Science Student Association
      </footer>
    </main>
  )
}
