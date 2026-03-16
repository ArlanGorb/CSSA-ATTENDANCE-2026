'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertOctagon, ScanLine, Camera, XCircle, ShieldCheck, ShieldOff, UserCheck, UserX, Loader2, Eye, EyeOff, MapPin, Navigation } from 'lucide-react';
import fpPromise from '@fingerprintjs/fingerprintjs';
import * as faceapi from 'face-api.js';
import { supabase } from '@/lib/supabase';

const DIVISIONS = [
  "Officer", "Kerohanian", "Mulmed", "Senat Angkatan",
  "Olahraga", "Humas", "Keamanan", "Pendidikan", "Parlemanterian"
];

// Face Detection Configuration
const FACE_DETECTION_INTERVAL_MS = 300;
const FACE_SCORE_THRESHOLD = 0.5;
const FACE_CONFIRM_FRAMES = 5;
const FACE_MIN_SIZE_RATIO = 0.08;
const FACE_MATCH_THRESHOLD = 0.55;

// Liveness Detection (Blink)
const EAR_THRESHOLD = 0.22; // Eye Aspect Ratio below this = eye closed
const REQUIRED_BLINKS = 2; // Blinks needed for liveness

// Eye Aspect Ratio calculation from 6 eye landmarks
function computeEAR(eye: faceapi.Point[]): number {
  const dist = (a: faceapi.Point, b: faceapi.Point) =>
    Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  const v1 = dist(eye[1], eye[5]);
  const v2 = dist(eye[2], eye[4]);
  const h = dist(eye[0], eye[3]);
  return h > 0 ? (v1 + v2) / (2 * h) : 0;
}

// Haversine formula to calculate distance in meters between two coordinates
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
  const [recognitionMode, setRecognitionMode] = useState<'auto' | 'manual'>('auto'); // auto = face recognition, manual = type name
  const labeledDescriptors = useRef<faceapi.LabeledFaceDescriptors[]>([]);

  // Manual fallback form
  const [manualName, setManualName] = useState('');
  const [manualDivision, setManualDivision] = useState('');

  // Liveness (Blink Detection) States
  const [blinkCount, setBlinkCount] = useState(0);
  const [livenessVerified, setLivenessVerified] = useState(false);
  const eyeClosedRef = useRef(false);
  const blinkCountRef = useRef(0);

  // GPS Geofencing States
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'checking' | 'verified' | 'denied' | 'out_of_range'>('idle');
  const [meetingLocation, setMeetingLocation] = useState<{ lat: number; lng: number; radius: number } | null>(null);
  const [distanceToMeeting, setDistanceToMeeting] = useState<number | null>(null);

  // Load face-api.js models and meeting details on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Load Models
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ]);
        setModelsLoaded(true);
        setDetectionStatus('AI Ready');
        console.log('[FaceAPI] All models loaded'); // Added console log back

        // Fetch Meeting Details for GPS
        const { data: meeting, error: mError } = await supabase
          .from('meetings')
          .select('latitude, longitude, radius_meters')
          .eq('id', params.meetingId)
          .single();
        
        if (mError) {
          console.error('[Supabase] Error fetching meeting details:', mError);
          // Optionally set an error state for meeting details
        }

        if (meeting && meeting.latitude && meeting.longitude) {
          setMeetingLocation({
            lat: meeting.latitude,
            lng: meeting.longitude,
            radius: meeting.radius_meters || 100
          });
          console.log('[Supabase] Meeting location loaded:', meeting); // Added console log
        } else {
          console.warn('[Supabase] Meeting location not found or incomplete for ID:', params.meetingId); // Added console log
        }
      } catch (err) {
        console.error('[Init] Error:', err);
        setModelLoadError('Failed to initialize system. Please refresh.');
        setDetectionStatus('AI Error'); // Ensure detection status is set on error
      }
    };
    init();
  }, [params.meetingId]); // Dependency array updated

  // Request user's geolocation
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLocationStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setLocationStatus('verified');
        console.log('[Geolocation] User location:', { latitude, longitude });

        if (meetingLocation) {
          const distance = getDistance(latitude, longitude, meetingLocation.lat, meetingLocation.lng);
          setDistanceToMeeting(distance);
          if (distance > meetingLocation.radius) {
            setLocationStatus('out_of_range');
            setError(`You are ${Math.round(distance)}m away, but the meeting is within ${meetingLocation.radius}m.`);
          } else {
            setLocationStatus('verified');
          }
        }
      },
      (err) => {
        console.error('[Geolocation] Error:', err);
        setLocationStatus('denied');
        setError('Geolocation permission denied or error occurred.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [meetingLocation]); // Added meetingLocation as dependency

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
          console.log(`[FaceAPI] Loaded ${labeled.length} face profiles for matching`);
        }
        setProfilesLoaded(true);
      } catch (err) {
        console.error('[FaceAPI] Failed to fetch profiles:', err);
        setProfilesLoaded(true); // Still set true to allow manual mode
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
    eyeClosedRef.current = false;
    blinkCountRef.current = 0;
    setFaceDetected(false);
    setFaceBox(null);
    setMatchedProfile(null);
    setMatchAttempted(false);
    setBlinkCount(0);
    setLivenessVerified(false);
    setDetectionStatus('Scanning for face...');

    let recognitionCounter = 0;

    detectionLoop.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        // Run full detection with landmarks for blink detection
        const fullDetection = await faceapi
          .detectSingleFace(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: FACE_SCORE_THRESHOLD }))
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

            setFaceBox({
              x: displayWidth - (det.box.x * scaleX) - (det.box.width * scaleX),
              y: det.box.y * scaleY,
              width: det.box.width * scaleX,
              height: det.box.height * scaleY,
            });

            // Blink detection using Eye Aspect Ratio
            const landmarks = fullDetection.landmarks.positions;
            const leftEye = landmarks.slice(36, 42);
            const rightEye = landmarks.slice(42, 48);
            const leftEAR = computeEAR(leftEye);
            const rightEAR = computeEAR(rightEye);
            const avgEAR = (leftEAR + rightEAR) / 2;

            if (avgEAR < EAR_THRESHOLD) {
              if (!eyeClosedRef.current) {
                eyeClosedRef.current = true; // Eyes just closed
              }
            } else {
              if (eyeClosedRef.current) {
                // Eyes just opened = blink completed
                eyeClosedRef.current = false;
                blinkCountRef.current++;
                setBlinkCount(blinkCountRef.current);
                if (blinkCountRef.current >= REQUIRED_BLINKS) {
                  setLivenessVerified(true);
                }
              }
            }

            if (faceConfirmCount.current >= FACE_CONFIRM_FRAMES) {
              setFaceDetected(true);

              // Run face recognition every 3rd cycle
              recognitionCounter++;
              if (recognitionCounter % 3 === 0 && labeledDescriptors.current.length > 0 && !matchedProfile) {
                try {
                  const recDetection = await faceapi
                    .detectSingleFace(videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: FACE_SCORE_THRESHOLD }))
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
                } catch (recErr) {
                  console.error('[FaceAPI] Recognition error:', recErr);
                }
              } else if (labeledDescriptors.current.length === 0) {
                setMatchAttempted(true);
              }

              // Update status message
              const identityOk = matchedProfile || (matchAttempted && recognitionMode === 'manual' && manualName && manualDivision) || (labeledDescriptors.current.length === 0 && matchAttempted);
              if (!livenessVerified && blinkCountRef.current < REQUIRED_BLINKS) {
                setDetectionStatus(`Blink ${blinkCountRef.current}/${REQUIRED_BLINKS} — please blink naturally`);
              } else if (matchedProfile) {
                setDetectionStatus(`Identified: ${matchedProfile.name}`);
              } else if (labeledDescriptors.current.length === 0) {
                setDetectionStatus('Face verified ✓ (no profiles)');
              } else if (!matchedProfile && matchAttempted) {
                setDetectionStatus('Face detected — identity unknown');
              } else {
                setDetectionStatus('Identifying face...');
              }
            } else {
              setDetectionStatus(`Verifying face... (${faceConfirmCount.current}/${FACE_CONFIRM_FRAMES})`);
            }
          }
        } else {
          // No face
          noFaceCount.current++;
          faceConfirmCount.current = Math.max(0, faceConfirmCount.current - 1);
          setFaceBox(null);
          if (noFaceCount.current > 3) {
            setFaceDetected(false);
            setMatchedProfile(null);
            setDetectionStatus('No face detected — look at camera');
          }
        }

        // Check for multiple faces separately
        const allFaces = await faceapi.detectAllFaces(
          videoRef.current!, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: FACE_SCORE_THRESHOLD })
        );
        if (allFaces.length > 1) {
          setDetectionStatus('Multiple faces — only 1 person allowed');
          setFaceDetected(false);
          setFaceBox(null);
          faceConfirmCount.current = 0;
          setMatchedProfile(null);
        }
      } catch (err) {
        console.error('[FaceAPI] Detection error:', err);
      }
    }, FACE_DETECTION_INTERVAL_MS);
  }, [modelsLoaded, matchedProfile, matchAttempted, recognitionMode, manualName, manualDivision, livenessVerified]);

  if (showSplash) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center text-white overflow-hidden">
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

  const startCamera = async () => {
    try {
      // Start GPS check alongside camera
      requestLocation();

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
          videoRef.current.onloadeddata = () => {
            startFaceDetection();
          };
        }
      }, 100);
    } catch (err) {
      setError("Camera access is required for Face Scan to verify your attendance.");
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
    setScanning(false);
    setFaceDetected(false);
    setFaceBox(null);
  };

  const canAuthenticate = () => {
    if (!faceDetected || !livenessVerified) return false;
    
    // GPS Verification (if meeting has location set)
    if (meetingLocation && locationStatus !== 'verified') return false;

    if (recognitionMode === 'auto') {
      return !!matchedProfile;
    } else {
      return manualName.trim() !== '' && manualDivision !== '';
    }
  };

  const getSubmitData = () => {
    if (recognitionMode === 'auto' && matchedProfile) {
      return { name: matchedProfile.name, division: matchedProfile.division };
    } else {
      return { name: manualName.trim(), division: manualDivision };
    }
  };

  const handleScan = () => {
    if (!canAuthenticate()) {
      setError('Cannot authenticate. Ensure face is recognized and liveness is verified (blink).');
      return;
    }

    // Capture photo BEFORE stopping detection
    if (videoRef.current) {
      photoRef.current = captureSnapshot(videoRef.current);
    }

    setScanning(true);
    setError(null);

    if (detectionLoop.current) {
      clearInterval(detectionLoop.current);
      detectionLoop.current = null;
    }

    // Final verification
    setTimeout(async () => {
      if (!videoRef.current || !modelsLoaded) {
        executeAttendanceSubmit();
        return;
      }

      try {
        const finalCheck = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: FACE_SCORE_THRESHOLD }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (finalCheck) {
          if (recognitionMode === 'auto' && matchedProfile && labeledDescriptors.current.length > 0) {
            const matcher = new faceapi.FaceMatcher(labeledDescriptors.current, FACE_MATCH_THRESHOLD);
            const finalMatch = matcher.findBestMatch(finalCheck.descriptor);
            const [finalName] = finalMatch.label.split('|||');
            if (finalMatch.label === 'unknown' || finalName !== matchedProfile.name) {
              setScanning(false);
              setError('Face identity changed. Please look at camera and try again.');
              startFaceDetection();
              return;
            }
          }
          // Update photo with final frame
          photoRef.current = captureSnapshot(videoRef.current);
          executeAttendanceSubmit();
        } else {
          setScanning(false);
          setError('Face lost during verification. Keep your face visible and try again.');
          startFaceDetection();
        }
      } catch (err) {
        console.error('[FaceAPI] Final check error:', err);
        executeAttendanceSubmit();
      }
    }, 1500);
  };

  const executeAttendanceSubmit = async () => {
    stopCamera();
    setLoading(true);
    setError(null);
    setStatus(null);

    const submitData = getSubmitData();

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: params.meetingId,
          token,
          name: submitData.name,
          division: submitData.division,
          deviceId: deviceId,
          photo: photoRef.current || undefined,
          userLat: userLocation?.lat,
          userLng: userLocation?.lng,
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatus(`Attendance recorded: ${data.status}`);
      } else {
        if (data.error && data.error.includes("already submitted")) {
          setShowBreachAlert(true);
        } else {
          setError(data.error);
        }
        setShowCamera(false);
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
    const submitData = getSubmitData();
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
            <p className="text-white/60 text-xs mt-2">Verified via Face AI as <span className="text-emerald-300 font-bold">{submitData.name}</span></p>
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
          @keyframes faceBoxPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
          }
          .face-box-pulse {
            animation: faceBoxPulse 1.5s ease-in-out infinite;
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.3s ease-out;
          }
        `}</style>

        <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/10 overflow-hidden relative">

          {showCamera ? (
            <div className="flex flex-col items-center animate-fade-in-up">
              <div className="flex justify-between w-full mb-4 items-center">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <Camera size={20} className="text-blue-400" />
                  Live Face Verify
                </h2>
                <button onClick={stopCamera} className="text-slate-400 hover:text-red-400 transition" type="button">
                  <XCircle size={24} />
                </button>
              </div>

              {/* GPS Geofencing Status */}
              <div className={`w-full mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all duration-300 ${
                locationStatus === 'verified' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' :
                locationStatus === 'out_of_range' ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400' :
                locationStatus === 'denied' ? 'bg-red-500/10 border border-red-500/30 text-red-400' :
                'bg-blue-500/10 border border-blue-500/30 text-blue-400'
              }`}>
                {locationStatus === 'verified' ? <MapPin size={12} /> : 
                 locationStatus === 'checking' ? <Loader2 size={12} className="animate-spin" /> : 
                 <Navigation size={12} />}
                
                <span className="flex-1">
                  {locationStatus === 'checking' ? 'Verifying Location...' :
                   locationStatus === 'verified' ? 'Location Confirmed' :
                   locationStatus === 'out_of_range' ? `Out of Range (${distanceToMeeting}m)` :
                   locationStatus === 'denied' ? 'GPS Access Denied' : 'Location Required'}
                </span>

                {locationStatus === 'denied' && (
                  <button onClick={requestLocation} className="underline decoration-dotted">Retry</button>
                )}
              </div>

              {/* AI Status Bar */}
              <div className={`w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                matchedProfile
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : faceDetected
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    : modelLoadError
                      ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                      : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
              }`}>
                {matchedProfile ? (
                  <UserCheck size={14} className="shrink-0" />
                ) : faceDetected ? (
                  <ShieldCheck size={14} className="shrink-0" />
                ) : (
                  <ShieldOff size={14} className="shrink-0 animate-pulse" />
                )}
                <span className="flex-1">{detectionStatus}</span>
                {faceDetected && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    matchedProfile ? 'text-green-300 bg-green-500/20' : 'text-amber-300 bg-amber-500/20'
                  }`}>
                    {faceConfidence}%
                  </span>
                )}
              </div>

              {/* Liveness / Blink Detection Indicator */}
              {faceDetected && (
                <div className={`w-full mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 ${
                  livenessVerified
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-500/10 border border-slate-500/30 text-slate-400'
                }`}>
                  {livenessVerified ? (
                    <Eye size={14} className="shrink-0 text-emerald-400" />
                  ) : (
                    <EyeOff size={14} className="shrink-0 animate-pulse" />
                  )}
                  <span className="flex-1">
                    {livenessVerified ? 'LIVENESS VERIFIED' : `Blink naturally (${blinkCount}/${REQUIRED_BLINKS})`}
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: REQUIRED_BLINKS }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          i < blinkCount ? 'bg-emerald-400 scale-110' : 'bg-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Profile Card */}
              {matchedProfile && (
                <div className="w-full mb-4 bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-fade-in-up">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 font-bold text-lg shrink-0">
                      {matchedProfile.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-green-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Identity Matched</p>
                      <p className="text-white font-bold text-lg leading-tight">{matchedProfile.name}</p>
                      <p className="text-green-300/70 text-xs">{matchedProfile.division}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-green-400 text-xs font-bold bg-green-500/20 px-2 py-1 rounded-full">
                        {Math.round((1 - matchedProfile.distance) * 100)}%
                      </span>
                      <p className="text-green-400/50 text-[9px] mt-1">match</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Unknown Face → Manual Fallback */}
              {faceDetected && !matchedProfile && matchAttempted && recognitionMode === 'auto' && (
                <div className="w-full mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-3">
                    <UserX size={16} className="text-amber-400" />
                    <p className="text-amber-300 text-xs font-semibold">Face not registered</p>
                  </div>
                  <p className="text-slate-400 text-xs mb-3">
                    Your face is not in our database. You can{' '}
                    <button
                      onClick={() => setRecognitionMode('manual')}
                      className="text-blue-400 underline hover:text-blue-300 font-semibold"
                    >
                      enter your details manually
                    </button>
                    {' '}or{' '}
                    <a href="/register" className="text-violet-400 underline hover:text-violet-300 font-semibold">
                      register your face first
                    </a>.
                  </p>
                </div>
              )}

              {/* Manual Input Mode */}
              {recognitionMode === 'manual' && (
                <div className="w-full mb-4 space-y-3 bg-white/5 border border-white/10 rounded-xl p-4 animate-fade-in-up">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Manual Entry</p>
                    {labeledDescriptors.current.length > 0 && (
                      <button
                        onClick={() => { setRecognitionMode('auto'); setMatchedProfile(null); setMatchAttempted(false); }}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold uppercase"
                      >
                        Switch to Auto
                      </button>
                    )}
                  </div>
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full bg-slate-800/50 border border-white/10 text-white p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm placeholder:text-slate-600"
                  />
                  <select
                    value={manualDivision}
                    onChange={(e) => setManualDivision(e.target.value)}
                    className="w-full bg-slate-800/50 border border-white/10 text-white p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm appearance-none"
                  >
                    <option value="" className="bg-slate-900 text-slate-400">Select Division...</option>
                    {DIVISIONS.map(div => <option key={div} value={div} className="bg-slate-900">{div}</option>)}
                  </select>
                </div>
              )}

              {/* Camera Feed */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black mb-4 ring-2 ring-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transition-all duration-700 -scale-x-100 ${scanning ? 'filter sepia-[0.3] hue-rotate-[180deg] saturate-[3] contrast-[1.5]' : ''}`}
                />

                {/* Real-time Face Bounding Box */}
                {faceBox && !scanning && (
                  <div
                    className={`absolute border-2 rounded-lg transition-all duration-150 ease-out face-box-pulse pointer-events-none z-20 ${
                      matchedProfile ? 'border-green-400' : 'border-amber-400'
                    }`}
                    style={{
                      left: `${faceBox.x}px`,
                      top: `${faceBox.y}px`,
                      width: `${faceBox.width}px`,
                      height: `${faceBox.height}px`,
                    }}
                  >
                    <div className={`absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 rounded-tl ${matchedProfile ? 'border-green-400' : 'border-amber-400'}`}></div>
                    <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 rounded-tr ${matchedProfile ? 'border-green-400' : 'border-amber-400'}`}></div>
                    <div className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 rounded-bl ${matchedProfile ? 'border-green-400' : 'border-amber-400'}`}></div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 rounded-br ${matchedProfile ? 'border-green-400' : 'border-amber-400'}`}></div>

                    {/* Identity label */}
                    <div className={`absolute -top-7 left-1/2 -translate-x-1/2 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg ${
                      matchedProfile ? 'bg-green-500' : 'bg-amber-500'
                    }`}>
                      {matchedProfile ? matchedProfile.name : 'UNKNOWN'}
                    </div>
                  </div>
                )}

                {/* Scanner Effect */}
                {scanning && (
                  <>
                    <div className="absolute top-0 left-0 w-full h-2 bg-green-400/80 shadow-[0_0_20px_#4ade80] animate-scan-line z-20"></div>
                    <div className="absolute inset-0 border-4 border-green-500/30 rounded-2xl animate-pulse z-10"></div>
                    <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 backdrop-blur-[2px] z-10">
                      <span className="px-4 py-2 bg-green-500 text-white font-bold tracking-widest rounded-full animate-pulse shadow-lg">VERIFYING IDENTITY...</span>
                    </div>
                  </>
                )}

                {/* Face Guide Overlay */}
                {!scanning && !faceBox && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="w-48 h-56 border-2 border-dashed border-white/60 rounded-[40%] shadow-[0_0_0_999px_rgba(0,0,0,0.5)]"></div>
                    <div className="absolute bottom-4 text-white/80 text-xs font-bold uppercase tracking-widest bg-black/50 px-3 py-1 rounded">
                      Align Face Here
                    </div>
                  </div>
                )}
              </div>

              {/* Detection Feedback */}
              <div className="w-full mb-4">
                {modelLoadError ? (
                  <p className="text-center text-red-400 text-xs bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                    {modelLoadError}
                  </p>
                ) : matchedProfile ? (
                  <p className="text-center text-green-400 text-xs px-4 flex items-center justify-center gap-1.5">
                    <UserCheck size={14} />
                    <span>Identity verified as <strong>{matchedProfile.name}</strong>. You can authenticate.</span>
                  </p>
                ) : faceDetected && recognitionMode === 'manual' && manualName && manualDivision ? (
                  <p className="text-center text-blue-400 text-xs px-4 flex items-center justify-center gap-1.5">
                    <ShieldCheck size={14} />
                    <span>Face verified. Ready to authenticate as {manualName}.</span>
                  </p>
                ) : !faceDetected ? (
                  <p className="text-center text-slate-400 text-xs px-4">
                    Position your face within the frame. The AI will detect and identify you.
                  </p>
                ) : null}
              </div>

              {/* Error */}
              {error && (
                <div className="w-full mb-4 bg-red-500/10 text-red-200 p-3 rounded-xl text-sm flex items-start gap-2 border border-red-500/20">
                  <AlertOctagon size={16} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleScan}
                disabled={scanning || !canAuthenticate() || !!modelLoadError}
                type="button"
                className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all transform active:scale-[0.98] flex justify-center items-center gap-2 ${
                  canAuthenticate() && !scanning
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-green-500/20 hover:scale-[1.02]'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-slate-600/30'
                }`}
              >
                {scanning ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Verifying Identity...</span>
                  </>
                ) : canAuthenticate() ? (
                  <>
                    <ShieldCheck size={18} />
                    <span>Authenticate{matchedProfile ? ` as ${matchedProfile.name}` : ''}</span>
                  </>
                ) : faceDetected ? (
                  <>
                    <UserX size={18} />
                    <span>Identity Required</span>
                  </>
                ) : (
                  <>
                    <ShieldOff size={18} />
                    <span>Waiting for Face...</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-block p-3 rounded-full bg-blue-500/20 mb-4 ring-1 ring-blue-400/30">
                  <ScanLine className="text-blue-400 w-8 h-8" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">CSSA Presence</h1>
                <p className="text-sm text-blue-200/60 mt-2 font-light tracking-wide">Verify your identity with Face AI.</p>

                {/* AI Status Indicators */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                    modelsLoaded
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : modelLoadError
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${modelsLoaded ? 'bg-green-400' : modelLoadError ? 'bg-red-400' : 'bg-blue-400 animate-ping'}`}></div>
                    {modelsLoaded ? 'Face AI Ready' : modelLoadError ? 'AI Error' : 'Loading AI...'}
                  </div>

                  {profilesLoaded && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      faceProfiles.length > 0
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${faceProfiles.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                      {faceProfiles.length > 0 ? `${faceProfiles.length} faces registered` : 'No faces registered'}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 text-red-200 p-4 rounded-xl text-sm mb-6 flex items-start gap-3 border border-red-500/20 animate-pulse">
                  <AlertOctagon size={18} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Info card */}
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-6">
                <p className="text-blue-200/80 text-xs leading-relaxed">
                  {faceProfiles.length > 0 ? (
                    <>📸 <strong>Face Recognition Active</strong> — The AI will identify you automatically when you open the camera. No need to type your name!</>
                  ) : (
                    <>⚠️ <strong>No faces registered yet</strong> — You can still attend, but you will need to enter your name manually. <a href="/register" className="text-violet-400 underline hover:text-violet-300 font-semibold">Register your face →</a></>
                  )}
                </p>
              </div>

              <button
                onClick={startCamera}
                disabled={!modelsLoaded}
                type="button"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {!modelsLoaded ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Loading Face AI...</span>
                  </>
                ) : (
                  <>
                    <Camera size={18} />
                    <span>Open Camera & Identify</span>
                  </>
                )}
              </button>

              <p className="text-center text-slate-600 text-xs mt-4">
                Don&apos;t have a face profile?{' '}
                <a href="/register" className="text-violet-400 hover:text-violet-300 transition-colors underline">
                  Register here
                </a>
              </p>
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
