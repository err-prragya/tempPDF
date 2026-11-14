import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, RotateCcw, SwitchCamera, X } from 'lucide-react';
import {
  computePixelCropRegion,
  updateCropRectByDrag,
  type CropDragMode,
  type NormalizedCropRect,
} from '../utils/crop';

interface CameraCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCroppedFile: (file: File) => void;
}

interface CapturedFrame {
  dataUrl: string;
  width: number;
  height: number;
}

const DEFAULT_CROP: NormalizedCropRect = {
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
};

export const CameraCropModal: React.FC<CameraCropModalProps> = ({
  isOpen,
  onClose,
  onConfirmCroppedFile,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    mode: CropDragMode;
    startClientX: number;
    startClientY: number;
    startRect: NormalizedCropRect;
    boxWidth: number;
    boxHeight: number;
  } | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [captured, setCaptured] = useState<CapturedFrame | null>(null);
  const [cropRect, setCropRect] = useState<NormalizedCropRect>(DEFAULT_CROP);
  const [isExporting, setIsExporting] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamReady(false);
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopCameraStream();
      setCameraError(null);
      setIsStartingCamera(true);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setIsStartingCamera(false);
        setCameraError('Camera access is not available in this browser.');
        return;
      }

      const isPortrait =
        typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: isPortrait ? 1080 : 1920 },
              height: { ideal: isPortrait ? 1920 : 1080 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setIsStreamReady(true);
      } catch (err) {
        console.error('Camera start failed:', err);
        setCameraError('Camera permission denied or no camera device found.');
      } finally {
        setIsStartingCamera(false);
      }
    },
    [stopCameraStream]
  );

  // Unlock forced landscape orientation while capturing/cropping so mobile stays in portrait
  useEffect(() => {
    if (!isOpen) return;
    const orientation = screen.orientation as ScreenOrientation & {
      unlock?: () => void;
      lock?: (type: string) => Promise<void>;
    };
    try {
      orientation?.unlock?.();
    } catch {
      // ignore
    }
    return () => {
      if (document.fullscreenElement && orientation?.lock) {
        orientation.lock('landscape').catch(() => {});
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setCaptured(null);
      setCameraError(null);
      return;
    }

    if (!captured) {
      startCamera(facingMode);
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, captured, facingMode, startCamera, stopCameraStream]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Measure available wrapper size so captured crop frame always expands edge-to-edge
  useEffect(() => {
    if (!isOpen || !captured) return;
    const el = stageWrapperRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setStageSize({ w, h });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, captured]);

  if (!isOpen) return null;

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !isStreamReady) return;
    const width = video.videoWidth || 1080;
    const height = video.videoHeight || 1440;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);

    stopCameraStream();
    setCropRect(DEFAULT_CROP);
    setCaptured({ dataUrl, width, height });
  };

  const handleRetake = () => {
    setCaptured(null);
    setCropRect(DEFAULT_CROP);
  };

  const handleConfirmCrop = () => {
    if (!captured || isExporting) return;
    setIsExporting(true);

    const img = new Image();
    img.onload = () => {
      const { sx, sy, sw, sh } = computePixelCropRegion(
        img.naturalWidth || captured.width,
        img.naturalHeight || captured.height,
        cropRect
      );
      const outCanvas = document.createElement('canvas');
      outCanvas.width = sw;
      outCanvas.height = sh;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) {
        setIsExporting(false);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      outCanvas.toBlob(
        (blob) => {
          setIsExporting(false);
          if (!blob) return;
          const file = new File([blob], `capture-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          onConfirmCroppedFile(file);
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => {
      setIsExporting(false);
    };
    img.src = captured.dataUrl;
  };

  const beginCropDrag = (mode: CropDragMode, e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const container = cropContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: cropRect,
      boxWidth: Math.max(1, rect.width),
      boxHeight: Math.max(1, rect.height),
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const moveCropDrag = (e: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dxNorm = (e.clientX - state.startClientX) / state.boxWidth;
    const dyNorm = (e.clientY - state.startClientY) / state.boxHeight;
    setCropRect(updateCropRectByDrag(state.startRect, state.mode, dxNorm, dyNorm));
  };

  const endCropDrag = (e: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  // Fit captured image cleanly to fill the full available viewport area
  let fittedWidth: number | undefined;
  let fittedHeight: number | undefined;
  if (captured && stageSize.w > 0 && stageSize.h > 0) {
    const scale = Math.min(stageSize.w / captured.width, stageSize.h / captured.height);
    fittedWidth = Math.max(1, Math.floor(captured.width * scale));
    fittedHeight = Math.max(1, Math.floor(captured.height * scale));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={captured ? 'Crop captured photo' : 'Camera capture'}
      className="fixed inset-0 z-[60] bg-black text-white flex flex-col overflow-hidden"
    >
      {/* Top Bar */}
      <div className="h-12 px-4 bg-black/95 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        {captured ? (
          <button
            type="button"
            onClick={handleRetake}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retake</span>
          </button>
        ) : (
          <span className="text-xs font-semibold text-white tracking-tight">Camera</span>
        )}

        {captured && (
          <span className="text-xs font-semibold text-white tracking-tight">Crop Photo</span>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Full-Bleed Camera Viewfinder OR Edge-to-Edge Crop Stage */}
      {!captured ? (
        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="max-w-sm mx-4 text-center space-y-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-sm text-red-300">{cameraError}</p>
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry Camera</span>
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                data-testid="camera-video"
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
              {isStartingCamera && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="px-3.5 py-2 rounded-lg bg-black/80 text-xs text-slate-200 border border-white/15">
                    Starting camera...
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div
          ref={stageWrapperRef}
          className="flex-1 min-h-0 w-full p-2 sm:p-4 bg-neutral-950 flex items-center justify-center overflow-hidden"
        >
          <div
            ref={cropContainerRef}
            data-testid="crop-stage"
            style={
              fittedWidth && fittedHeight
                ? { width: `${fittedWidth}px`, height: `${fittedHeight}px` }
                : {
                    width: '100%',
                    height: '100%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    aspectRatio: `${captured.width} / ${captured.height}`,
                  }
            }
            className="relative overflow-hidden rounded-lg select-none bg-black shadow-2xl"
          >
            <img
              src={captured.dataUrl}
              alt="Captured camera preview"
              draggable={false}
              className="w-full h-full block object-fill pointer-events-none select-none"
            />

            {/* Interactive Crop Box */}
            <div
              data-testid="crop-box"
              onPointerDown={(e) => beginCropDrag('move', e)}
              onPointerMove={moveCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                touchAction: 'none',
              }}
              className="absolute border-2 border-amber-400 cursor-move"
            >
              {/* Rule-of-thirds grid */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-r border-b border-white/25" />
                <div className="border-b border-white/25" />
                <div className="border-r border-white/25" />
                <div className="border-r border-white/25" />
                <div />
              </div>

              {/* Generous Touch-Friendly Corner Resize Handles */}
              <button
                type="button"
                aria-label="Resize crop top-left"
                onPointerDown={(e) => beginCropDrag('nw', e)}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                style={{ touchAction: 'none' }}
                className="absolute -left-4 -top-4 w-8 h-8 flex items-center justify-center cursor-nwse-resize"
              >
                <span className="w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
              </button>
              <button
                type="button"
                aria-label="Resize crop top-right"
                onPointerDown={(e) => beginCropDrag('ne', e)}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                style={{ touchAction: 'none' }}
                className="absolute -right-4 -top-4 w-8 h-8 flex items-center justify-center cursor-nesw-resize"
              >
                <span className="w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
              </button>
              <button
                type="button"
                aria-label="Resize crop bottom-left"
                onPointerDown={(e) => beginCropDrag('sw', e)}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                style={{ touchAction: 'none' }}
                className="absolute -left-4 -bottom-4 w-8 h-8 flex items-center justify-center cursor-nesw-resize"
              >
                <span className="w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
              </button>
              <button
                type="button"
                aria-label="Resize crop bottom-right"
                onPointerDown={(e) => beginCropDrag('se', e)}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                style={{ touchAction: 'none' }}
                className="absolute -right-4 -bottom-4 w-8 h-8 flex items-center justify-center cursor-nwse-resize"
              >
                <span className="w-5 h-5 rounded-full bg-amber-400 border-2 border-slate-950 shadow-md" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div className="px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-black/95 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
        {!captured ? (
          <>
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              aria-label="Switch camera"
              className="inline-flex items-center justify-center gap-1.5 w-20 py-2.5 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
            >
              <SwitchCamera className="w-4 h-4" aria-hidden="true" />
              <span>Flip</span>
            </button>

            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={!isStreamReady}
              aria-label="Capture"
              className="w-16 h-16 rounded-full bg-white p-1 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
            >
              <span className="w-full h-full rounded-full border-2 border-black flex items-center justify-center text-black">
                <Camera className="w-6 h-6" aria-hidden="true" />
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-20 py-2.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-center"
            >
              Cancel
            </button>
          </>
        ) : (
          <div className="w-full max-w-md mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCropRect({ x: 0, y: 0, width: 1, height: 1 })}
              className="px-4 py-3 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 rounded-xl transition-colors whitespace-nowrap"
            >
              Full Frame
            </button>

            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isExporting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{isExporting ? 'Cropping...' : 'Crop & Place'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
