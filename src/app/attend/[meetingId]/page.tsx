'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertOctagon, ScanLine, Camera, XCircle, ShieldCheck, ShieldOff, UserCheck, UserX, Loader2, Eye, EyeOff, UserPlus } from 'lucide-react';
import fpPromise from '@fingerprintjs/fingerprintjs';
import * as faceapi from 'face-api.js';
import { supabase } from '@/lib/supabase';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

// Face Detection Configuration
const FACE_DETECTION_INTERVAL_MS = 300;
const FACE_SCORE_THRESHOLD = 0.6; // Higher threshold for detection confidence
const FACE_CONFIRM_FRAMES = 10; // More frames for stability (approx 3 seconds)
const FACE_MIN_SIZE_RATIO = 0.12; // Face must be larger/closer (at least 12% of screen)
const FACE_MATCH_THRESHOLD = 0.45; // Stricter = Higher Accuracy

// Liveness Detection (Mouth Open)
const MAR_THRESHOLD = 0.5; // Mouth Aspect Ratio above this = mouth open

// Mouth Aspect Ratio calculation from inner mouth landmarks (60-67)
function computeMAR(mouth: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  // mouth[2] is top inner lip, mouth[6] is bottom inner lip
  // mouth[0] is left corner, mouth[4] is right corner
  const v = dist(mouth[2], mouth[6]);
  const h = dist(mouth[0], mouth[4]);
  return h > 0 ? v / h : 0;
}

// Capture snapshot from video
function captureSnapshot(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

type FaceProfile = {
  id: string;
  name: string;
  division: string;
  face_descriptor: number[];
};

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
  const [deviceId, setDeviceId] = useState<string>('');
  const [showBreachAlert, setShowBreachAlert] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<string | null>(null);

  // Face Detection & Recognition States
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<string>('Loading AI...');
  const faceConfirmCount = useRef(0);
  const noFaceCount = useRef(0);
  const detectionLoop = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Face Recognition States
  const [faceProfiles, setFaceProfiles] = useState<FaceProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<{ name: string; division: string; distance: number } | null>(null);
  const [matchAttempted, setMatchAttempted] = useState(false);
  const labeledDescriptors = useRef<faceapi.LabeledFaceDescriptors[]>([]);

  // Liveness (Mouth Open) States
  const [livenessVerified, setLivenessVerified] = useState(false);

  // Load face-api.js models on mount
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        setModelsLoaded(true);
        setDetectionStatus('AI Ready');
      } catch (err) {
        console.error('[Init] Error:', err);
        setModelLoadError('Failed to initialize system. Please refresh.');
        setDetectionStatus('AI Error');
      }
    };
    init();
  }, []);

  // Fetch registered face profiles
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await fetch('/api/face-profiles');
        const data = await res.json();
        if (data.profiles && data.profiles.length > 0) {
          setFaceProfiles(data.profiles);

          // Build labeled descriptors for face matching
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
        setProfilesLoaded(true);
      } catch (err) {
        console.error('[FaceAPI] Failed to fetch profiles:', err);
        setProfilesLoaded(true);
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    const initFingerprint = async () => {
      const fp = await fpPromise.load();
      const result = await fp.get();
      setDeviceId(result.visitorId);
    };
    initFingerprint();

    // SECURITY: Poison pill for admin session. 
    // If a student opens this page, ensure no admin session is active on this device.
    localStorage.removeItem('cssa_admin_auth');
    
    return () => clearTimeout(timer);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectionLoop.current) clearInterval(detectionLoop.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Real-time face detection + recognition loop
  const startFaceDetection = useCallback(() => {
    if (!modelsLoaded || !videoRef.current) return;

    faceConfirmCount.current = 0;
    noFaceCount.current = 0;

    setFaceDetected(false);
    setFaceBox(null);
    setMatchedProfile(null);
    setMatchAttempted(false);
    setLivenessVerified(false);
    setDetectionStatus('Scanning for face...');

    let recognitionCounter = 0;

    detectionLoop.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        const fullDetection = await faceapi
          .detectSingleFace(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
          .withFaceLandmarks();

        if (fullDetection) {
          const det = fullDetection.detection;
          const videoWidth = videoRef.current!.videoWidth;
          const videoHeight = videoRef.current!.videoHeight;
          const faceArea = (det.box.width * det.box.height) / (videoWidth * videoHeight);

          if (faceArea < FACE_MIN_SIZE_RATIO) {
            noFaceCount.current++;
            faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
            setDetectionStatus('Move closer to camera');
            setFaceBox(null);
          } else {
            faceConfirmCount.current++;
            noFaceCount.current = 0;
            setFaceConfidence(Math.round(det.score * 100));

            const displayWidth = videoRef.current!.clientWidth;
            const displayHeight = videoRef.current!.clientHeight;
            const scaleX = displayWidth / videoWidth;
            const scaleY = displayHeight / videoHeight;

            const currentFaceBox = {
              x: displayWidth - (det.box.x * scaleX) - (det.box.width * scaleX),
              y: det.box.y * scaleY,
              width: det.box.width * scaleX,
              height: det.box.height * scaleY,
            };
            setFaceBox(currentFaceBox);

            // Mouth Open detection
            const landmarks = fullDetection.landmarks.positions;
            const mouthInner = landmarks.slice(60, 68);
            const MAR = computeMAR(mouthInner);

            if (MAR > MAR_THRESHOLD) {
              setLivenessVerified(true);
            }

            if (faceConfirmCount.current >= FACE_CONFIRM_FRAMES) {
              setFaceDetected(true);
              recognitionCounter++;
              
              // Only attempt recognition if not already matched and face is stable
              if (recognitionCounter % 3 === 0 && labeledDescriptors.current.length > 0 && !matchedProfile) {
                try {
                  const recDetection = await faceapi
                    .detectSingleFace(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                  if (recDetection) {
                    const matcher = new faceapi.FaceMatcher(labeledDescriptors.current, FACE_MATCH_THRESHOLD);
                    const match = matcher.findBestMatch(recDetection.descriptor);
                    if (match.label !== 'unknown') {
                      const [matchName, matchDivision] = match.label.split('|||');
                      setMatchedProfile({ name: matchName, division: matchDivision, distance: match.distance });
                    } else {
                      setMatchAttempted(true);
                    }
                  }
                } catch (recErr) { console.error(recErr); }
              } else if (labeledDescriptors.current.length === 0) {
                setMatchAttempted(true);
              }

              if (!livenessVerified) {
                setDetectionStatus(`Buka mulut Anda untuk konfirmasi`);
              } else if (matchedProfile) {
                setDetectionStatus(`Identified: ${matchedProfile.name}`);
              } else if (!matchedProfile && matchAttempted) {
                setDetectionStatus('IDENTITY UNKNOWN — REGISTER REQUIRED');
              } else {
                setDetectionStatus('Verifying identity...');
              }
            } else {
              setDetectionStatus(`STABILIZING... (${faceConfirmCount.current}/${FACE_CONFIRM_FRAMES})`);
            }
          }
        } else {
          noFaceCount.current++;
          faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
          setFaceBox(null);
          if (noFaceCount.current > 3) {
            setFaceDetected(false);
            setMatchedProfile(null);
            setDetectionStatus('Look directly at camera');
          }
        }

        // Multiple face detection for extra security
        const allFaces = await faceapi.detectAllFaces(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }));
        if (allFaces.length > 1) {
          setDetectionStatus('Multiple faces — identification blocked');
          setFaceDetected(false);
          setFaceBox(null);
          faceConfirmCount.current = 0;
        }
      } catch (err) { console.error(err); }
    }, FACE_DETECTION_INTERVAL_MS);
  }, [modelsLoaded, matchedProfile, matchAttempted, livenessVerified]);

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
      setMatchedProfile(null);
      setMatchAttempted(false);
      faceConfirmCount.current = 0;
      noFaceCount.current = 0;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => startFaceDetection();
        }
      }, 100);
    } catch (err) {
      setError("Camera access is required for High-Precision Face Scan.");
    }
  };

  const stopCamera = () => {
    if (detectionLoop.current) clearInterval(detectionLoop.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setScanning(false);
    setFaceDetected(false);
    setFaceBox(null);
  };

  const canAuthenticate = () => {
    return !!(faceDetected && livenessVerified && matchedProfile);
  };

  const handleScan = () => {
    if (!canAuthenticate()) return;
    
    // Capture metadata/photo state before finalizing
    if (videoRef.current) photoRef.current = captureSnapshot(videoRef.current);
    setScanning(true);
    setError(null);
    
    // Security: We already verified for 10 consecutive frames (~3s)
    // Plus liveness (mouth open). We don't need a single-frame secondary check 
    // that might fail due to a blink or slight blur in that specific instant.
    if (detectionLoop.current) clearInterval(detectionLoop.current);

    setTimeout(() => {
      executeAttendanceSubmit();
    }, 800);
  };

  const executeAttendanceSubmit = async () => {
    if (!matchedProfile) return;
    stopCamera();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: params.meetingId,
          token,
          name: matchedProfile.name,
          division: matchedProfile.division,
          deviceId: deviceId,
          photo: photoRef.current || undefined,
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        if (data.error && data.error.includes("already submitted")) setShowBreachAlert(true);
        else setError(data.error);
        setShowCamera(false);
        setScanning(false);
      }
    } catch (err) {
      setError('Connection failed. Please check your internet.');
      setShowCamera(false);
      setScanning(false);
    } finally { setLoading(false); }
  };

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center text-white overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[100px] animate-pulse delay-700"></div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-8 relative group">
            <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse rounded-full"></div>
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
      </div>
    );
  }

  if (!token) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center"><AlertOctagon size={48} className="text-red-500 mb-4" /><h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Access</h1><p className="text-gray-500">Please scan the QR code provided by the Admin.</p></div>;

  if (showBreachAlert) return <div className="fixed inset-0 z-50 bg-red-950 flex flex-col items-center justify-center text-white overflow-hidden text-center"><div className="absolute inset-0 bg-red-600/20 animate-[pulse_0.5s_infinite]"></div><AlertOctagon size={100} className="text-red-500 mb-6 animate-bounce" /><h1 className="text-6xl font-black tracking-widest text-red-500 mb-2 uppercase">SECURITY BREACH</h1><p className="text-xl text-red-300 font-mono tracking-wide uppercase max-w-md bg-black/50 p-4 border border-red-500/50 mt-4 rounded-lg">Multiple check-ins detected <br/> from a single device footprint.</p><div className="mt-12 text-sm text-red-400 font-mono flex items-center gap-2 opacity-70"><span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>INCIDENT LOGGED [DEVICE_ID: {deviceId.substring(0,8)}...]</div></div>;

  if (status) {
    return <div className="fixed inset-0 z-50 bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex flex-col items-center justify-center text-white text-center"><CheckCircle size={80} className="text-green-400 mb-8" /><h1 className="text-5xl font-bold mb-4">ACCESS GRANTED</h1><div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-6 max-w-xs w-full"><p className="text-2xl font-bold text-white">{status}</p><p className="text-white/60 text-xs mt-2">Verified via Face AI as <span className="text-emerald-300 font-bold">{matchedProfile?.name || 'User'}</span></p></div><p className="mt-12 text-emerald-400/60 text-sm tracking-[0.2em]">You may close this window</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <style>{`@keyframes scanLine { 0%, 100% { top: 0%; } 50% { top: 96%; } } .animate-scan-line { animation: scanLine 2s infinite; } @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.3s ease-out; }`}</style>
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">
          {showCamera ? (
            <div className="flex flex-col items-center animate-fade-in-up">
              <div className="flex justify-between w-full mb-4 items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Camera size={20} className="text-blue-400" />High-Precision Scan</h2>
                <button onClick={stopCamera} className="text-slate-400 hover:text-red-400 transition"><XCircle size={24} /></button>
              </div>

              <div className={`w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${matchedProfile ? 'bg-green-500/10 border border-green-500/30 text-green-400' : faceDetected ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'}`}>
                {matchedProfile ? <UserCheck size={14} /> : faceDetected ? <ShieldCheck size={14} /> : <ShieldOff size={14} className="animate-pulse" />}
                <span className="flex-1 text-[10px] sm:text-xs font-bold">{detectionStatus}</span>
                {faceDetected && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-white">{faceConfidence}%</span>}
              </div>

              {faceDetected && (
                <div className={`w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ${livenessVerified ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border border-slate-500/30 text-slate-400'}`}>
                  {livenessVerified ? <ShieldCheck size={14} /> : <Loader2 size={14} className="animate-spin" />}
                  <span className="flex-1">{livenessVerified ? 'LIVENESS VERIFIED' : 'Buka mulut Anda sedikit'}</span>
                </div>
              )}

              {matchedProfile && (
                <div className="w-full mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in-up flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">{matchedProfile.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1">
                    <p className="text-green-200 text-[9px] font-bold uppercase tracking-widest">Profile Matched</p>
                    <p className="text-white font-bold leading-tight">{matchedProfile.name}</p>
                    <p className="text-green-300/70 text-xs">{matchedProfile.division}</p>
                  </div>
                </div>
              )}

              {faceDetected && !matchedProfile && matchAttempted && (
                <div className="w-full mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-fade-in-up">
                  <p className="text-red-400 text-xs font-bold mb-2 flex items-center gap-2"><AlertOctagon size={14} /> IDENTITY UNKNOWN</p>
                  <p className="text-slate-400 text-xs mb-3 font-medium">This face is not in our record. Please register your profile first.</p>
                  <a href="/register" className="flex items-center justify-center gap-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95">
                    <UserPlus size={14} /> Register Face
                  </a>
                </div>
              )}

              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black mb-4 ring-2 ring-blue-500/50 shadow-2xl">
                <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover -scale-x-100 ${scanning ? 'filter sepia-[0.3] contrast-[1.5]' : ''}`} />
                {faceBox && !scanning && <div className="absolute border-2 rounded-lg pointer-events-none z-20 border-green-400/70 shadow-[0_0_15px_rgba(74,222,128,0.3)]" style={{ left: `${faceBox.x}px`, top: `${faceBox.y}px`, width: `${faceBox.width}px`, height: `${faceBox.height}px` }} />}
                {scanning && <div className="absolute top-0 left-0 w-full h-2 bg-green-400/80 animate-scan-line z-20 shadow-[0_0_20px_#4ade80]"></div>}
                {!scanning && !faceBox && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40"><div className="w-56 h-72 border-2 border-dashed border-white rounded-[100px]"></div></div>}
              </div>

              {error && <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs font-medium animate-pulse"><AlertOctagon size={14} /> {error}</div>}

              <button onClick={handleScan} disabled={scanning || !canAuthenticate()} className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all ${canAuthenticate() && !scanning ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:brightness-110 active:scale-95' : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'}`}>
                {scanning ? 'Finalizing...' : canAuthenticate() ? 'Authenticate Now' : !matchedProfile && matchAttempted ? 'Registration Required' : 'Stabilize Your Face'}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="inline-block p-4 rounded-full bg-blue-500/10 mb-6 border border-blue-500/20"><ScanLine className="text-blue-400 w-10 h-10" /></div>
              <h1 className="text-3xl font-bold text-white tracking-tight">CSSA Presence</h1>
              <p className="text-sm text-blue-200/60 mt-2 mb-8">High-Precision Identification System v2.0</p>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-xs text-blue-100/70 leading-relaxed text-left space-y-2">
                <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Ensure good lighting</p>
                <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Look directly at the camera</p>
                <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Blink when prompted for liveness</p>
              </div>

              <button onClick={startCamera} disabled={!modelsLoaded} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 border border-white/10">
                {modelsLoaded ? "Secure Identification" : "Initializing AI..."}
              </button>
              
              <p className="text-slate-600 text-xs mt-6">First time? <a href="/register" className="text-blue-400 font-bold hover:underline">Register your face</a></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
