import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine, SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";

const REAR_CAMERA = /back|rear|environment|world|外向|后置/i;
/** The same QR held in front of the camera is reported once per this window. */
const REPEAT_SCAN_MS = 2500;
const overlayButton = "btn btn-sm bg-brand-950/60 text-white backdrop-blur hover:bg-brand-950/80";

interface QrScannerProps {
  /** Shown on the live badge and the start button, e.g. "Time In". */
  modeLabel: string;
  /** Tints the frame after a scan result. */
  tone: "ok" | "error" | null;
  onScan: (text: string) => void;
  onStart: () => void;
  onError: (message: string) => void;
}

/**
 * Camera preview that decodes QR codes (~10 per second, jsQR loaded on first
 * start), prefers the rear camera once, can cycle cameras and suppresses
 * repeated reads of the same code.
 */
export default function QrScanner({ modeLabel, tone, onScan, onStart, onError }: QrScannerProps) {
  const [active, setActive] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRead = useRef({ data: "", at: 0 });
  const autoPicked = useRef(false);

  const read = useEffectEvent((data: string) => {
    const now = Date.now();
    if (lastRead.current.data === data && now - lastRead.current.at < REPEAT_SCAN_MS) return;
    lastRead.current = { data, at: now };
    onScan(data);
  });
  const fail = useEffectEvent(() => {
    onError("Unable to access the camera. Grant camera permission or use the manual search below.");
    setActive(false);
  });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!active || !video || !canvas) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    const start = async () => {
      try {
        const media = navigator.mediaDevices;
        if (!media?.getUserMedia) throw new Error("Camera API unavailable");
        const decoder = import("jsqr"); // ~130 kB — only fetched once the camera starts
        try {
          stream = await media.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: "environment" } } });
        } catch {
          if (cameraId) {
            if (!cancelled) setCameraId(null); // chosen camera vanished — fall back to the default one
            return;
          }
          stream = await media.getUserMedia({ video: true }); // no rear camera — any camera will do
        }
        if (cancelled) return void stream.getTracks().forEach((t) => t.stop());
        video.srcObject = stream;
        await video.play().catch(() => undefined); // autoplay restrictions
        lastRead.current = { data: "", at: 0 };

        const current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        const devices = ((await media.enumerateDevices?.()) ?? []).filter((d) => d.kind === "videoinput");
        if (cancelled) return;
        setCameras(devices);
        setActiveCameraId(current);
        if (!cameraId && !autoPicked.current && devices.length > 1) {
          // Browsers often open the front camera first; prefer the rear one once.
          autoPicked.current = true;
          const rear = devices.find((d) => REAR_CAMERA.test(d.label));
          if (rear && rear.deviceId !== current) return setCameraId(rear.deviceId);
        }

        const { default: jsQR } = await decoder;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let lastDecode = 0;
        const tick = (t: number) => {
          raf = requestAnimationFrame(tick);
          // Decoding every frame pegs the CPU; ~10 scans/s is plenty.
          if (!ctx || t - lastDecode < 100 || video.readyState < video.HAVE_ENOUGH_DATA || !video.videoWidth) return;
          lastDecode = t;
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
          if (code?.data) read(code.data);
        };
        if (!cancelled) raf = requestAnimationFrame(tick);
      } catch (error) {
        console.error("Error starting QR scanner camera:", error);
        if (!cancelled) fail();
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [active, cameraId]);

  const switchCamera = () => {
    const next = cameras[(cameras.findIndex((d) => d.deviceId === activeCameraId) + 1) % cameras.length];
    if (next) setCameraId(next.deviceId);
  };

  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-2xl bg-brand-950 ring-4 transition-shadow",
        tone === "ok" ? "ring-success/50" : tone === "error" ? "ring-danger/40" : "ring-transparent",
      )}
    >
      <video ref={videoRef} className={cn("absolute inset-0 h-full w-full object-cover", !active && "invisible")} muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      {active ? (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-3/5 -translate-x-1/2 -translate-y-1/2">
            {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c) => (
              <span key={c} className={cn("absolute h-8 w-8 border-white/90", c)} />
            ))}
            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-powder" />
          </div>
          <span className="chip absolute left-3 top-3 bg-brand-950/60 text-white backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            Live · {modeLabel}
          </span>
          <div className="absolute inset-x-3 bottom-3 flex justify-between gap-2">
            {cameras.length > 1 ? (
              <button type="button" onClick={switchCamera} className={overlayButton}>
                <SwitchCamera className="h-3.5 w-3.5" /> Switch
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => setActive(false)} className={overlayButton}>
              <CameraOff className="h-3.5 w-3.5" /> Stop camera
            </button>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/70">
          <div className="grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-white/5">
            <ScanLine className="h-7 w-7" />
          </div>
          <p className="text-sm">Camera is off</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onStart();
              autoPicked.current = false;
              setActive(true);
            }}
          >
            <Camera className="h-4 w-4" /> Start {modeLabel} scanner
          </button>
        </div>
      )}
    </div>
  );
}
