'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, XCircle, CheckCircle, AlertOctagon, ScanLine, ShieldCheck, ShieldOff, UserPlus, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import * as faceapi from 'face-api.js';
import Link from 'next/link';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

const CAPTURE_COUNT = 5;  // Number of face captures for reliable descriptor
const CAPTURE_INTERVAL_MS = 600; // Time between captures
const FACE_SCORE_THRESHOLD = 0.5;
const FACE_MATCH_THRESHOLD = 0.45; // High accuracy threshold

type FaceProfile = {
  id: string;
  name: string;
  division: string;
  face_descriptor: number[];
};

export default function RegisterFace() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [detectionStatus, setDetectionStatus] = useState('Memuat AI...');

  // Capture states
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [capturedDescriptors, setCapturedDescriptors] = useState<Float32Array[]>([]);

  // Result states
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState('');

  // Duplicate detection states
  const [faceProfiles, setFaceProfiles] = useState<FaceProfile[]>([]);
  const [duplicateFound, setDuplicateFound] = useState<{ name: string; division: string } | null>(null);
  const labeledDescriptors = useRef<faceapi.LabeledFaceDescriptors[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoop = useRef<NodeJS.Timeout | null>(null);
  const faceConfirmCount = useRef(0);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        setModelsLoaded(true);
        setDetectionStatus('AI Siap');
        console.log('[FaceAPI] All models loaded for registration');
      } catch (err) {
        console.error('[FaceAPI] Model load error:', err);
        setModelLoadError('Gagal memuat model AI. Silakan muat ulang.');
        setDetectionStatus('Kesalahan AI');
      }
    };
    loadModels();
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/face-profiles');
      const data = await res.json();
      if (data.profiles && data.profiles.length > 0) {
        setFaceProfiles(data.profiles);
        const labeled = data.profiles
          .filter((p: FaceProfile) => p.face_descriptor && p.face_descriptor.length === 128)
          .map((p: FaceProfile) => {
            return new faceapi.LabeledFaceDescriptors(
              `${p.name}|||${p.division}`,
              [new Float32Array(p.face_descriptor)]
            );
          });
        labeledDescriptors.current = labeled;
      }
    } catch (err) {
      console.error('[FaceAPI] Failed to fetch profiles for duplicate check:', err);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (detectionLoop.current) clearInterval(detectionLoop.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      setShowCamera(true);
      setError(null);
      setFaceDetected(false);
      setFaceBox(null);
      faceConfirmCount.current = 0;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            startFaceDetection();
          };
        }
      }, 100);
    } catch (err) {
      setError('Akses kamera diperlukan untuk pendaftaran wajah.');
    }
  };

  const stopCamera = () => {
    if (detectionLoop.current) {
      clearInterval(detectionLoop.current);
      detectionLoop.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setFaceDetected(false);
    setFaceBox(null);
  };

  const startFaceDetection = useCallback(() => {
    if (!modelsLoaded || !videoRef.current) return;

    faceConfirmCount.current = 0;
    setFaceDetected(false);
    setFaceBox(null);
    setDetectionStatus('Memindai wajah...');

    detectionLoop.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        // We use full detection (landmarks + descriptor) for duplicate check
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: FACE_SCORE_THRESHOLD }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          const faceArea = (detection.detection.box.width * detection.detection.box.height) / (videoWidth * videoHeight);

          if (faceArea < 0.08) {
            setDetectionStatus('Dekatkan wajah ke kamera');
            setFaceBox(null);
            faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
            setDuplicateFound(null);
          } else {
            // DUPLICATE FACE CHECK
            if (labeledDescriptors.current.length > 0) {
              const matcher = new faceapi.FaceMatcher(labeledDescriptors.current, FACE_MATCH_THRESHOLD);
              const bestMatch = matcher.findBestMatch(detection.descriptor);
              
              if (bestMatch.label !== 'unknown') {
                const [dName, dDiv] = bestMatch.label.split('|||');
                // Only flag if it's NOT the same person being updated (optional logic)
                // For safety, we block any existing face from registering a new name
                setDuplicateFound({ name: dName, division: dDiv });
                setDetectionStatus('WAJAH TERDAFTAR');
              } else {
                setDuplicateFound(null);
              }
            }

            faceConfirmCount.current++;
            setFaceConfidence(Math.round(detection.detection.score * 100));

            const displayWidth = videoRef.current.clientWidth;
            const displayHeight = videoRef.current.clientHeight;
            const scaleX = displayWidth / videoWidth;
            const scaleY = displayHeight / videoHeight;

            setFaceBox({
              x: displayWidth - (detection.detection.box.x * scaleX) - (detection.detection.box.width * scaleX),
              y: detection.detection.box.y * scaleY,
              width: detection.detection.box.width * scaleX,
              height: detection.detection.box.height * scaleY,
            });

            if (faceConfirmCount.current >= 5) {
              setFaceDetected(true);
              if (!duplicateFound) {
                setDetectionStatus('Wajah terkunci — siap ambil sampel');
              }
            } else {
              setDetectionStatus(`Memverifikasi wajah... (${faceConfirmCount.current}/5)`);
            }
          }
        } else {
          faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
          setFaceBox(null);
          setDuplicateFound(null);
          if (faceConfirmCount.current === 0) {
            setFaceDetected(false);
            setDetectionStatus('Wajah tidak terdeteksi — lihat kamera');
          }
        }
      } catch (err) {
        console.error('[FaceAPI] Detection error:', err);
      }
    }, 300);
  }, [modelsLoaded, duplicateFound]);

  // Capture multiple face descriptors
  const handleCapture = async () => {
    if (!videoRef.current || !modelsLoaded || !faceDetected) return;

    setCapturing(true);
    setCaptureProgress(0);
    setCapturedDescriptors([]);
    setError(null);

    // Stop real-time detection box updates during capture
    if (detectionLoop.current) {
      clearInterval(detectionLoop.current);
      detectionLoop.current = null;
    }

    const descriptors: Float32Array[] = [];

    for (let i = 0; i < CAPTURE_COUNT; i++) {
      if (!videoRef.current) break;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: FACE_SCORE_THRESHOLD }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          // FINAL DUPLICATE CHECK on the first stable capture
          if (i === 0 && labeledDescriptors.current.length > 0) {
            const matcher = new faceapi.FaceMatcher(labeledDescriptors.current, FACE_MATCH_THRESHOLD);
            const match = matcher.findBestMatch(detection.descriptor);
            if (match.label !== 'unknown' && !match.label.startsWith(name.trim())) {
              const [dName, dDiv] = match.label.split('|||');
              setError(`WAJAH SUDAH TERDAFTAR: Wajah ini terdeteksi milik "${dName}" (${dDiv}). Satu orang hanya boleh memiliki satu profil.`);
              setCapturing(false);
              startFaceDetection();
              return;
            }
          }

          descriptors.push(detection.descriptor);
          setCaptureProgress(i + 1);
        } else {
          // Face lost during capture — retry this frame
          i--;
          await new Promise(r => setTimeout(r, 200));
          continue;
        }
      } catch (err) {
        console.error(`[FaceAPI] Capture ${i + 1} error:`, err);
      }

      // Wait between captures for slightly different angles
      if (i < CAPTURE_COUNT - 1) {
        setDetectionStatus(`Sampel ${i + 1}/${CAPTURE_COUNT} diambil — tahan posisi...`);
        await new Promise(r => setTimeout(r, CAPTURE_INTERVAL_MS));
      }
    }

    if (descriptors.length >= 3) {
      setCapturedDescriptors(descriptors);
      setDetectionStatus(`✓ ${descriptors.length} sampel wajah diambil!`);

      // Submit to API
      await submitFaceProfile(descriptors);
    } else {
      setError(`Only captured ${descriptors.length} face samples. Need at least 3. Please try again.`);
      setCapturing(false);
      startFaceDetection(); // Restart detection
    }
  };

  const submitFaceProfile = async (descriptors: Float32Array[]) => {
    setSubmitting(true);
    setDetectionStatus('Menyimpan profil wajah...');

    try {
      // Average the descriptors
      const avgDescriptor = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        let sum = 0;
        for (const desc of descriptors) {
          sum += desc[i];
        }
        avgDescriptor[i] = sum / descriptors.length;
      }

      const res = await fetch('/api/face-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          division,
          faceDescriptor: Array.from(avgDescriptor),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setResultMessage(data.updated
          ? `Profil wajah "${name}" telah diperbarui!`
          : `Profil wajah "${name}" berhasil didaftarkan!`
        );
        stopCamera();
      } else {
        setError(data.error || 'Gagal menyimpan profil wajah.');
        setCapturing(false);
        startFaceDetection();
      }
    } catch (err) {
      setError('Kesalahan jaringan. Silakan coba lagi.');
      setCapturing(false);
      startFaceDetection();
    } finally {
      setSubmitting(false);
    }
  };

  // Success Screen
  if (success) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex flex-col items-center justify-center text-white overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px] animate-pulse delay-1000"></div>
        </div>

        <div className="relative z-10 flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-green-500 blur-2xl opacity-30 animate-ping rounded-full duration-[3000ms]"></div>
            <div className="bg-white/10 p-8 rounded-full backdrop-blur-xl border border-white/20 shadow-[0_0_50px_rgba(16,185,129,0.5)] relative animate-[bounce_2s_infinite]">
              <Sparkles size={80} className="text-green-400 drop-shadow-lg" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-green-200 via-white to-green-200 text-center">
            WAJAH TERDAFTAR
          </h1>

          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 text-center">
            <p className="text-emerald-200 text-sm font-medium uppercase tracking-widest mb-2">Profile</p>
            <p className="text-2xl font-bold text-white mb-1">{name}</p>
            <p className="text-emerald-300/70 text-sm">{division}</p>
            <div className="h-1 w-16 bg-green-500/50 mx-auto rounded-full mt-4 mb-2"></div>
            <p className="text-white/60 text-xs mt-2">{resultMessage}</p>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setSuccess(false);
                setName('');
                setDivision('');
                setCapturedDescriptors([]);
                setCaptureProgress(0);
                setCapturing(false);
              }}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-medium transition-all flex items-center gap-2"
            >
              <UserPlus size={18} />
              Daftar Lagi
            </button>
            <Link
              href="/"
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-medium transition-all flex items-center gap-2 justify-center"
            >
              <ArrowLeft size={18} />
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px] animate-pulse delay-1000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <style>{`
          @keyframes faceBoxPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(168, 85, 247, 0); }
          }
          .face-box-pulse {
            animation: faceBoxPulse 1.5s ease-in-out infinite;
          }
          @keyframes captureFlash {
            0% { opacity: 0.8; }
            100% { opacity: 0; }
          }
        `}</style>

        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">

          {showCamera ? (
            <div className="flex flex-col items-center">
              <div className="flex justify-between w-full mb-4 items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <Camera size={20} className="text-violet-400" />
                  Registrasi Wajah
                </h2>
                <button onClick={stopCamera} className="text-slate-400 hover:text-red-400 transition" type="button">
                  <XCircle size={24} />
                </button>
              </div>

              {/* Name/Division Info */}
              <div className="w-full mb-4 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{name}</p>
                  <p className="text-slate-400 text-xs">{division}</p>
                </div>
              </div>

              {/* AI Status Bar */}
              <div className={`w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                capturing
                  ? 'bg-violet-500/10 border border-violet-500/30 text-violet-400'
                  : duplicateFound
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse'
                    : faceDetected
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
              }`}>
                {capturing ? (
                  <Loader2 size={14} className="shrink-0 animate-spin" />
                ) : faceDetected ? (
                  <ShieldCheck size={14} className="shrink-0" />
                ) : (
                  <ShieldOff size={14} className="shrink-0 animate-pulse" />
                )}
                <span className="flex-1">{detectionStatus}</span>
                {faceDetected && !capturing && (
                  <span className="text-green-300 text-[10px] bg-green-500/20 px-2 py-0.5 rounded-full">
                    {faceConfidence}%
                  </span>
                )}
              </div>

              {/* Capture Progress */}
              {capturing && (
                <div className="w-full mb-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>Mengambil sampel wajah</span>
                    <span className="text-violet-400 font-bold">{captureProgress}/{CAPTURE_COUNT}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${(captureProgress / CAPTURE_COUNT) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Camera Feed */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black mb-4 ring-2 ring-violet-500/50 shadow-[0_0_30px_rgba(139,92,246,0.2)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />

                {/* Face Bounding Box */}
                {faceBox && !capturing && (
                  <div
                    className="absolute border-2 border-violet-400 rounded-lg transition-all duration-150 ease-out face-box-pulse pointer-events-none z-20"
                    style={{
                      left: `${faceBox.x}px`,
                      top: `${faceBox.y}px`,
                      width: `${faceBox.width}px`,
                      height: `${faceBox.height}px`,
                    }}
                  >
                    <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-violet-400 rounded-tl"></div>
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-violet-400 rounded-tr"></div>
                    <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-violet-400 rounded-bl"></div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-violet-400 rounded-br"></div>
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-violet-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">
                      FACE {faceConfidence}%
                    </div>
                  </div>
                )}

                {/* Capture Flash Effect */}
                {capturing && captureProgress > 0 && (
                  <div
                    key={captureProgress}
                    className="absolute inset-0 bg-white/30 pointer-events-none z-30"
                    style={{ animation: 'captureFlash 0.3s ease-out forwards' }}
                  ></div>
                )}

                {/* Duplicate Found Warning */}
                {duplicateFound && !capturing && (
                  <div className="w-full mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex items-center gap-2 mb-2">
                       <AlertOctagon size={16} className="text-red-400" />
                       <p className="text-red-300 text-xs font-bold">WAJAH SUDAH TERDAFTAR</p>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed">
                       Wajah ini sudah terdaftar atas nama <strong className="text-white">{duplicateFound.name}</strong> ({duplicateFound.division}). 
                       Tidak diperbolehkan mendaftar lebih dari satu profil.
                    </p>
                  </div>
                )}

                {/* Guide overlay when no face */}
                {!faceBox && !capturing && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-48 h-56 border-2 border-dashed border-white/60 rounded-[40%] shadow-[0_0_0_999px_rgba(0,0,0,0.5)]"></div>
                    <div className="absolute bottom-4 text-white/80 text-xs font-bold uppercase tracking-widest bg-black/50 px-3 py-1 rounded">
                      Posisikan Wajah Di Sini
                    </div>
                  </div>
                )}

                {/* Capture overlay */}
                {capturing && (
                  <div className="absolute inset-0 border-4 border-violet-500/50 rounded-2xl z-10">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full text-violet-300 text-sm font-bold tracking-wider flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        {submitting ? 'MENYIMPAN...' : 'MENGAMBIL...'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="w-full mb-4 bg-red-500/10 text-red-200 p-3 rounded-xl text-sm flex items-start gap-2 border border-red-500/20">
                  <AlertOctagon size={16} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={handleCapture}
                disabled={!faceDetected || capturing || submitting || !!duplicateFound}
                type="button"
                className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex justify-center items-center gap-2 ${
                  faceDetected && !capturing && !duplicateFound
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-white shadow-violet-500/20 hover:scale-[1.02]'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-slate-600/30'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Menyimpan Profil...</span>
                  </>
                ) : capturing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Mengambil... ({captureProgress}/{CAPTURE_COUNT})</span>
                  </>
                ) : faceDetected ? (
                  <>
                    <Sparkles size={18} />
                    <span>Ambil Sampel & Daftar</span>
                  </>
                ) : (
                  <>
                    <ShieldOff size={18} />
                    <span>Menunggu Wajah...</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-block p-3 rounded-full bg-violet-500/20 mb-4 ring-1 ring-violet-400/30">
                  <UserPlus className="text-violet-400 w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Daftar Wajah</h1>
                <p className="text-sm text-violet-200/60 mt-2 font-light tracking-wide">Daftarkan wajah Anda untuk verifikasi presensi.</p>

                {/* AI Model Status */}
                <div className={`inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  modelsLoaded
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : modelLoadError
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${modelsLoaded ? 'bg-green-400' : modelLoadError ? 'bg-red-400' : 'bg-blue-400 animate-ping'}`}></div>
                  {modelsLoaded ? 'AI Siap' : modelLoadError ? 'AI Error' : 'Memuat AI...'}
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 text-red-200 p-4 rounded-xl text-sm mb-6 flex items-start gap-3 border border-red-500/20">
                  <AlertOctagon size={18} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-6">
                <div className="group">
                  <label className="block text-xs font-semibold text-violet-300 uppercase tracking-wider mb-2 ml-1">Nama Lengkap</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 group-hover:border-violet-500/30"
                    placeholder="Contoh: John Doe"
                  />
                </div>

                <div className="group">
                  <label className="block text-xs font-semibold text-violet-300 uppercase tracking-wider mb-2 ml-1">Divisi</label>
                  <div className="relative">
                    <select
                      value={division}
                      onChange={(e) => setDivision(e.target.value)}
                      required
                      className="w-full bg-slate-800/50 border border-white/10 text-white p-4 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none appearance-none transition-all group-hover:border-violet-500/30"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">Pilih Divisi...</option>
                      {DIVISIONS.map(div => <option key={div} value={div} className="bg-slate-900">{div}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                <button
                  onClick={startCamera}
                  disabled={!modelsLoaded || !name.trim() || !division}
                  type="button"
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-violet-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-2"
                >
                  {!modelsLoaded ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Memuat AI...</span>
                    </>
                  ) : (
                    <>
                      <Camera size={18} />
                      <span>Buka Kamera</span>
                    </>
                  )}
                </button>
              </div>

              {/* Navigation */}
              <div className="mt-6 text-center">
                <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  ← Kembali ke Beranda
                </Link>
              </div>
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
