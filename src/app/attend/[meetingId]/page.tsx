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

// Face Detection Configuration — Optimized for HIGH ACCURACY
const FACE_DETECTION_INTERVAL_MS = 200; // Faster polling for smoother detection
const FACE_SCORE_THRESHOLD = 0.5;
const FACE_CONFIRM_FRAMES = 6; // Slightly fewer frames needed (SSD is more reliable)
const FACE_MIN_SIZE_RATIO = 0.12; // Allow slightly smaller faces (for distance)
const FACE_MATCH_THRESHOLD = 0.42; // Stricter matching to reduce false positives (was 0.45)
const REQUIRED_CONSECUTIVE_MATCHES = 3;
const SSD_MIN_CONFIDENCE = 0.5; // SSD MobileNet minimum detection confidence

// Liveness Detection (Smile)
const SMILE_THRESHOLD = 0.74;

// Smile Score calculation: Mouth width / Eye distance
function computeSmileScore(landmarks: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  
  const mouthWidth = dist(landmarks[48], landmarks[54]);
  const eyeDist = dist(landmarks[36], landmarks[45]);
  
  return eyeDist > 0 ? mouthWidth / eyeDist : 0;
}

// Capture snapshot from video (higher resolution for better quality)
function captureSnapshot(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 640, 480);
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch { return null; }
}

type FaceProfile = {
  id: string;
  name: string;
  division: string;
  face_descriptor: number[] | number[][];
};

export default function MemberAttendance({ params }: { params: { meetingId: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<string | null>(null);
  const [attendanceResult, setAttendanceResult] = useState<{name: string, division: string, status: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // Biometric / Camera States
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [showBreachAlert, setShowBreachAlert] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const geoWatchId = useRef<number | null>(null);
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

  // Liveness (Smile) States
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [neutralFaceDetected, setNeutralFaceDetected] = useState(false); 
  const [smileScore, setSmileScore] = useState(0); 
  const [photoCaptured, setPhotoCaptured] = useState(false);

  // Liveness (Smile) Refs for logic loop
  const livenessVerifiedRef = useRef(false);
  const neutralFaceDetectedRef = useRef(false);
  
  // Identity Stability
  const consecutiveMatchCount = useRef(0);
  const lastMatchedName = useRef<string | null>(null);

  // Load face-api.js models on mount
  useEffect(() => {
    const init = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),   // Primary: HIGH accuracy detection
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'), // Secondary: fast multi-face check
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models'), // Better liveness analysis
        ]);
        setModelsLoaded(true);
        setDetectionStatus('Sistem Siap');
      } catch (err) {
        console.error('[Init] Error:', err);
        setModelLoadError('Gagal inisialisasi sistem. Silakan muat ulang.');
        setDetectionStatus('Kesalahan AI');
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
            .filter((p: FaceProfile) => p.face_descriptor && (p.face_descriptor as any).length > 0)
            .map((p: FaceProfile) => {
              // Handle both legacy (flat array) and new (array of arrays) format
              const rawDescriptors = p.face_descriptor;
              const descriptors: Float32Array[] = Array.isArray((rawDescriptors as any)[0])
                ? (rawDescriptors as number[][]).map((d: any) => new Float32Array(d))
                : [new Float32Array(rawDescriptors as number[])];

              return new faceapi.LabeledFaceDescriptors(
                `${p.name}|||${p.division}`,
                descriptors
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

    // Capture GPS location for geofencing (continuous watching for best accuracy)
    if (navigator.geolocation) {
      geoWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
          // Once we have good accuracy (< 30m), we can stop watching to save battery
          if (pos.coords.accuracy < 30 && geoWatchId.current !== null) {
            navigator.geolocation.clearWatch(geoWatchId.current);
            geoWatchId.current = null;
          }
        },
        (err) => {
          console.warn('[Geo] Location error:', err.message);
          setGeoError('Tidak dapat mengakses lokasi. Aktifkan GPS Anda.');
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

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
      if (geoWatchId.current !== null) {
        navigator.geolocation.clearWatch(geoWatchId.current);
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
    livenessVerifiedRef.current = false;
    setNeutralFaceDetected(false);
    neutralFaceDetectedRef.current = false;
    setDetectionStatus('Memindai wajah...');

    let recognitionCounter = 0;

    detectionLoop.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        // Use SSD MobileNet for MORE ACCURATE face detection (slower but much better precision)
        const fullDetection = await faceapi
          .detectSingleFace(videoRef.current!, new faceapi.SsdMobilenetv1Options({ minConfidence: SSD_MIN_CONFIDENCE }))
          .withFaceLandmarks();

        if (fullDetection) {
          const det = fullDetection.detection;
          const videoWidth = videoRef.current!.videoWidth;
          const videoHeight = videoRef.current!.videoHeight;
          const faceArea = (det.box.width * det.box.height) / (videoWidth * videoHeight);

          if (faceArea < FACE_MIN_SIZE_RATIO) {
            noFaceCount.current++;
            faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
            setDetectionStatus('Dekatkan wajah ke kamera');
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

            // Smile detection for liveness
            const landmarks = fullDetection.landmarks.positions;
            const currentScore = computeSmileScore(landmarks);
            setSmileScore(currentScore);

            // State-based liveness: Must see neutral face first, then smile
            // Lenient neutral check: anything less than 72% smile
            if (currentScore < 0.72) {
              if (!neutralFaceDetectedRef.current) {
                neutralFaceDetectedRef.current = true;
                setNeutralFaceDetected(true);
              }
            }

            if (neutralFaceDetectedRef.current && currentScore > SMILE_THRESHOLD) {
              if (!livenessVerifiedRef.current) {
                livenessVerifiedRef.current = true;
                setLivenessVerified(true);
              }
            }

            if (faceConfirmCount.current >= FACE_CONFIRM_FRAMES) {
              setFaceDetected(true);
              recognitionCounter++;
              
              // Only attempt recognition if not already matched and face is stable
              if (recognitionCounter % 2 === 0 && labeledDescriptors.current.length > 0 && !matchedProfile) {
                try {
                  // HIGH PRECISION Recognition using SsdMobilenetv1 + descriptor
                  const recDetection = await faceapi
                    .detectSingleFace(videoRef.current!, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                  if (recDetection) {
                    // Multi-descriptor averaging: compare against ALL samples of each profile
                    // and average the distances for a more robust match
                    let bestMatch = { label: 'unknown', distance: 1.0 };

                    for (const labeled of labeledDescriptors.current) {
                      const distances = labeled.descriptors.map(refDesc => {
                        return faceapi.euclideanDistance(
                          Array.from(recDetection.descriptor),
                          Array.from(refDesc)
                        );
                      });
                    
                      // Use the median distance (more robust than average against outliers)
                      const sorted = [...distances].sort((a, b) => a - b);
                      const medianDist = sorted[Math.floor(sorted.length / 2)];

                      if (medianDist < bestMatch.distance) {
                        bestMatch = { label: labeled.label, distance: medianDist };
                      }
                    }

                    if (bestMatch.distance < FACE_MATCH_THRESHOLD) {
                      const [matchName, matchDivision] = bestMatch.label.split('|||');
                      
                      // Identity Stability Check (Consecutive Matches)
                      if (lastMatchedName.current === matchName) {
                        consecutiveMatchCount.current++;
                      } else {
                        consecutiveMatchCount.current = 1;
                        lastMatchedName.current = matchName;
                      }

                      if (consecutiveMatchCount.current >= REQUIRED_CONSECUTIVE_MATCHES) {
                        setMatchedProfile({ name: matchName, division: matchDivision, distance: bestMatch.distance });
                      } else {
                        setDetectionStatus(`Verifying Identity... (${consecutiveMatchCount.current}/${REQUIRED_CONSECUTIVE_MATCHES})`);
                      }
                    } else {
                      consecutiveMatchCount.current = 0;
                      lastMatchedName.current = null;
                      setMatchAttempted(true);
                    }
                  }
                } catch (recErr) { console.error(recErr); }
              } else if (labeledDescriptors.current.length === 0) {
                setMatchAttempted(true);
              }

              if (!neutralFaceDetected) {
                setDetectionStatus('Tampilkan wajah netral...');
              } else if (!livenessVerified) {
                setDetectionStatus(`Tersenyum lebar untuk konfirmasi liveness`);
              } else if (matchedProfile) {
                setDetectionStatus(`Terverifikasi: ${matchedProfile.name}`);
              } else if (!matchedProfile && matchAttempted) {
                setDetectionStatus('IDENTITAS TIDAK DIKENAL');
              } else {
                setDetectionStatus('Verifying stable profile...');
              }
            } else {
              setDetectionStatus(`STABILISASI... (${faceConfirmCount.current}/${FACE_CONFIRM_FRAMES})`);
            }
          }
        } else {
          noFaceCount.current++;
          faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
          consecutiveMatchCount.current = 0; // Reset stability on face loss
          setFaceBox(null);
          if (noFaceCount.current > 3) {
            setFaceDetected(false);
            setMatchedProfile(null);
            setDetectionStatus('Lihat langsung ke kamera');
          }
        }

        // Multiple face detection for extra security
        // Multi-face security check (use TinyFace for speed here — just need count)
        const allFaces = await faceapi.detectAllFaces(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }));
        if (allFaces.length > 1) {
          setDetectionStatus('Beberapa wajah — identifikasi diblokir');
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
        video: { 
          facingMode: 'user', 
          width: { ideal: 1280 },  // Higher resolution for better facial detail
          height: { ideal: 720 },
        }
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
      setError("Akses kamera diperlukan untuk Pemindaian Wajah Presisi.");
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
    const currentProfile = matchedProfile; // Capture the current profile state immediately
    if (!currentProfile) {
      console.warn('[handleScan] No matched profile found at click time');
      return;
    }

    console.log('[handleScan] Identity confirmed, preparing final capture...', currentProfile.name);
    
    // Capture metadata/photo state before finalizing
    if (videoRef.current) {
      photoRef.current = captureSnapshot(videoRef.current);
      setPhotoCaptured(true);
    }
    setScanning(true);
    setError(null);
    
    // Stop the detection loop immediately to freeze the state
    if (detectionLoop.current) {
      console.log('[handleScan] Clearing detection loop');
      clearInterval(detectionLoop.current);
      detectionLoop.current = null;
    }

    setTimeout(() => {
      console.log('[handleScan] Executing final submission for:', currentProfile.name);
      // Final snap just before submit for better accuracy
      if (videoRef.current) photoRef.current = captureSnapshot(videoRef.current);
      executeAttendanceSubmit(currentProfile);
    }, 800);
  };

  const executeAttendanceSubmit = async (profileToSubmit: { name: string; division: string }) => {
    if (!profileToSubmit) {
      console.error('[executeAttendanceSubmit] Profile is missing!');
      return;
    }
    
    console.log('[executeAttendanceSubmit] Starting API call for:', profileToSubmit.name);

    // Safety triple-check capture before camera stops
    if (videoRef.current && !photoRef.current) {
      photoRef.current = captureSnapshot(videoRef.current);
    }
    
    // Re-capture fresh GPS position right before submitting for maximum accuracy
    let freshLat = userLocation?.latitude;
    let freshLon = userLocation?.longitude;
    let freshAccuracy = userLocation?.accuracy;

    if (navigator.geolocation) {
      try {
        const freshPos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 5000, maximumAge: 0
          });
        });
        freshLat = freshPos.coords.latitude;
        freshLon = freshPos.coords.longitude;
        freshAccuracy = freshPos.coords.accuracy;
      } catch (e) {
        console.warn('[Geo] Fresh position failed, using cached:', e);
      }
    }

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
          name: profileToSubmit.name,
          division: profileToSubmit.division,
          deviceId: deviceId,
          photo: photoRef.current || undefined,
          latitude: freshLat,
          longitude: freshLon,
          gpsAccuracy: freshAccuracy,
        })
      });

      const data = await res.json();
      console.log('[executeAttendanceSubmit] API Response:', res.status, data);

      if (res.ok) {
        console.log('[executeAttendanceSubmit] Success! Showing success screen.');
        setAttendanceResult({
          name: profileToSubmit.name,
          division: profileToSubmit.division,
          status: data.status || 'Hadir'
        });
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        if (data.error && data.error.includes("already submitted")) {
          setShowBreachAlert(true);
        } else if (data.geoRequired) {
          setError('⚠️ Lokasi GPS diperlukan. Aktifkan GPS dan coba lagi.');
        } else if (data.distance) {
          setError(`📍 Anda di luar area (${data.distance}m dari lokasi, maks ${data.maxRadius}m).`);
        } else {
          setError(data.error || 'Terjadi kesalahan. Silakan coba lagi.');
        }
      }
    } catch (err) {
      console.error('[executeAttendanceSubmit] Fetch error:', err);
      setError('Koneksi gagal. Periksa internet Anda.');
    } finally { setLoading(false); }
  };

  if (attendanceResult || status) {
    const displayName = attendanceResult?.name || matchedProfile?.name || 'User';
    const displayStatus = attendanceResult?.status || status || 'Recorded';

    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 flex flex-col items-center justify-center text-white text-center p-6">
        <div className="animate-bounce mb-8">
          <CheckCircle size={100} className="text-green-400 drop-shadow-[0_0_20px_rgba(74,222,128,0.5)]" />
        </div>
        <h1 className="text-5xl font-black mb-4 tracking-tight">AKSES DITERIMA</h1>
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-sm w-full shadow-2xl">
          <p className="text-3xl font-bold text-white mb-2">{displayStatus}</p>
          <div className="h-px bg-white/20 w-full mb-4"></div>
          <p className="text-white/70 text-sm uppercase tracking-widest font-bold mb-1">Identitas Terverifikasi</p>
          <p className="text-2xl font-bold text-emerald-300">{displayName}</p>
          <p className="text-white/50 text-xs mt-1">{attendanceResult?.division || matchedProfile?.division || ''}</p>
        </div>
        <p className="mt-12 text-emerald-400/60 text-sm tracking-[0.3em] font-medium animate-pulse uppercase">Anda boleh menutup jendela ini</p>
      </div>
    );
  }

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
            <p className="text-xs tracking-[0.2em] font-medium text-blue-300">INISIALISASI SISTEM</p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center"><AlertOctagon size={48} className="text-red-500 mb-4" /><h1 className="text-xl font-bold text-gray-900 mb-2">Akses Tidak Sah</h1><p className="text-gray-500">Silakan scan kode QR yang disediakan oleh Admin.</p></div>;

  if (showBreachAlert) return <div className="fixed inset-0 z-50 bg-red-950 flex flex-col items-center justify-center text-white overflow-hidden text-center"><div className="absolute inset-0 bg-red-600/20 animate-[pulse_0.5s_infinite]"></div><AlertOctagon size={100} className="text-red-500 mb-6 animate-bounce" /><h1 className="text-6xl font-black tracking-widest text-red-500 mb-2 uppercase">PELANGGARAN KEAMANAN</h1><p className="text-xl text-red-300 font-mono tracking-wide uppercase max-w-md bg-black/50 p-4 border border-red-500/50 mt-4 rounded-lg">Beberapa absensi terdeteksi <br/> dari satu sidik jari perangkat.</p><div className="mt-12 text-sm text-red-400 font-mono flex items-center gap-2 opacity-70"><span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>KEJADIAN DICATAT [ID_PERANGKAT: {deviceId.substring(0,8)}...]</div></div>;

  if (status) return null; 

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <style>{`@keyframes scanLine { 0%, 100% { top: 0%; } 50% { top: 96%; } } .animate-scan-line { animation: scanLine 2s infinite; } @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.3s ease-out; }`}</style>
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">
          {showCamera ? (
            <div className="flex flex-col items-center animate-fade-in-up">
              <div className="flex justify-between w-full mb-4 items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2"><Camera size={20} className="text-blue-400" />Scan Presisi Tinggi</h2>
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
                  <span className="flex-1 text-[10px] sm:text-xs tracking-tighter sm:tracking-normal">{livenessVerified ? 'LIVENESS TERVERIFIKASI' : 'Tersenyum lebar untuk konfirmasi'}</span>
                  {!livenessVerified && <span className="text-[10px] opacity-60 font-mono">{(smileScore * 10).toFixed(1)}/{(SMILE_THRESHOLD * 10).toFixed(1)}</span>}
                </div>
              )}

              {matchedProfile && (
                <div className="w-full mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in-up flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold">{matchedProfile.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1">
                    <p className="text-green-200 text-[9px] font-bold uppercase tracking-widest">Profil Cocok</p>
                    <p className="text-white font-bold leading-tight">{matchedProfile.name}</p>
                    <p className="text-green-300/70 text-xs">{matchedProfile.division}</p>
                    {photoCaptured && (
                      <div className="mt-2 flex items-center gap-1.5 text-blue-400 font-bold text-[10px] animate-pulse">
                        <Camera size={12} /> BUKTI FOTO DIAMBIL!
                      </div>
                    )}
                  </div>
                </div>
              )}

              {faceDetected && !matchedProfile && matchAttempted && (
                <div className="w-full mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4 animate-fade-in-up">
                  <p className="text-red-400 text-xs font-bold mb-2 flex items-center gap-2"><AlertOctagon size={14} /> IDENTITAS TIDAK DIKENAL</p>
                  <p className="text-slate-400 text-xs mb-3 font-medium">Wajah ini tidak terdaftar di sistem kami. Silakan daftarkan profil Anda terlebih dahulu.</p>
                  <a href="/register" className="flex items-center justify-center gap-2 w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95">
                    <UserPlus size={14} /> Daftar Wajah
                  </a>
                </div>
              )}

              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black mb-4 ring-2 ring-blue-500/50 shadow-2xl">
                <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover -scale-x-100 ${scanning ? 'filter sepia-[0.3] contrast-[1.5]' : ''}`} />
                {/* Futuristic AI Vision Frame */}
                {faceBox && !scanning && (
                  <div
                    className="absolute transition-all duration-150 ease-out z-20 pointer-events-none"
                    style={{
                      left: `${faceBox.x}px`,
                      top: `${faceBox.y}px`,
                      width: `${faceBox.width}px`,
                      height: `${faceBox.height}px`,
                    }}
                  >
                    {/* Corner Brackets */}
                    <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl shadow-[0_0_15px_rgba(34,197,94,0.5)] ${matchedProfile ? 'border-emerald-500' : 'border-blue-500'}`}></div>
                    <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr shadow-[0_0_15px_rgba(34,197,94,0.5)] ${matchedProfile ? 'border-emerald-500' : 'border-blue-500'}`}></div>
                    <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl shadow-[0_0_15px_rgba(34,197,94,0.5)] ${matchedProfile ? 'border-emerald-500' : 'border-blue-500'}`}></div>
                    <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br shadow-[0_0_15px_rgba(34,197,94,0.5)] ${matchedProfile ? 'border-emerald-500' : 'border-blue-500'}`}></div>
                    
                    {/* Scanning Line */}
                    <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-[scan_1.5s_infinite] shadow-[0_0_10px_rgba(59,130,246,0.8)]`}></div>
                    
                    {/* AI Meta Labels */}
                    <div className="absolute -top-8 left-0 flex items-center gap-2 animate-pulse">
                      <div className={`text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg uppercase ${matchedProfile ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                        {matchedProfile ? 'ID_MATCHED' : 'SCANNING_ID...'}
                      </div>
                      <div className="bg-black/50 backdrop-blur-sm text-blue-400 text-[8px] font-bold px-1.5 py-0.5 border border-blue-500/30 rounded uppercase tracking-tighter">
                        CON: {faceConfidence}%
                      </div>
                    </div>
                    
                    {/* Data Scan Stream */}
                    <div className="absolute -right-4 top-0 h-full flex flex-col justify-around transition-opacity duration-300">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-1.5 h-[1px] bg-blue-400 shadow-[0_0_5px_rgba(59,130,246,1)]"></div>
                      ))}
                    </div>

                    <style jsx>{`
                      @keyframes scan {
                        0% { top: 0%; opacity: 0; }
                        10% { opacity: 1; }
                        90% { opacity: 1; }
                        100% { top: 100%; opacity: 0; }
                      }
                    `}</style>
                  </div>
                )}
                {scanning && <div className="absolute top-0 left-0 w-full h-2 bg-green-400/80 animate-scan-line z-20 shadow-[0_0_20px_#4ade80]"></div>}
                {!scanning && !faceBox && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40"><div className="w-56 h-72 border-2 border-dashed border-white rounded-[100px]"></div></div>}
              </div>

              {error && <div className="w-full mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-xs font-medium animate-pulse"><AlertOctagon size={14} /> {error}</div>}

              <button onClick={handleScan} disabled={scanning || !canAuthenticate()} className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all ${canAuthenticate() && !scanning ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:brightness-110 active:scale-95' : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'}`}>
                {scanning ? 'Menyelesaikan...' : canAuthenticate() ? 'Autentikasi Sekarang' : !matchedProfile && matchAttempted ? 'Wajib Registrasi' : 'Stabilkan Wajah Anda'}
              </button>
            </div>
          ) : (
            <div className="text-center">
              {/* Loading state after authentication */}
              {loading && (
                <div className="flex flex-col items-center py-12">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500/30 border-t-blue-400 mb-6"></div>
                  <p className="text-white font-semibold text-lg">Memproses Kehadiran...</p>
                  <p className="text-blue-300/60 text-sm mt-2">Mohon tunggu sebentar</p>
                </div>
              )}

              {/* Error state after failed submission */}
              {error && !loading && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <AlertOctagon size={18} />
                    <span className="font-bold text-sm">Gagal Mengirim Absen</span>
                  </div>
                  <p className="text-red-300/80 text-xs leading-relaxed">{error}</p>
                  <button 
                    onClick={() => { setError(null); startCamera(); }}
                    className="mt-4 w-full py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-all"
                  >
                    Coba Lagi
                  </button>
                </div>
              )}

              {!loading && !error && (
                <>
                  <div className="inline-block p-4 rounded-full bg-blue-500/10 mb-6 border border-blue-500/20"><ScanLine className="text-blue-400 w-10 h-10" /></div>
                  <h1 className="text-3xl font-bold text-white tracking-tight">Presensi CSSA</h1>
                  <p className="text-sm text-blue-200/60 mt-2 mb-8">Sistem Identifikasi Presisi Tinggi v2.0</p>
                  
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-xs text-blue-100/70 leading-relaxed text-left space-y-2">
                    <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Pastikan pencahayaan cukup</p>
                    <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Lihat langsung ke kamera</p>
                    <p className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Tersenyum saat diminta</p>
                  </div>

                  {geoError && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-xs font-medium flex items-center gap-2">
                      <AlertOctagon size={14} /> {geoError}
                    </div>
                  )}

                  <button onClick={startCamera} disabled={!modelsLoaded} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 border border-white/10">
                    {modelsLoaded ? "Identifikasi Aman" : "Inisialisasi AI..."}
                  </button>
                  
                  <p className="text-slate-600 text-xs mt-6">Baru di sini? <a href="/register" className="text-blue-400 font-bold hover:underline">Daftarkan wajah Anda</a></p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
