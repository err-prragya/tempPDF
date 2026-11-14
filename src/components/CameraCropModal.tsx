import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, RotateCcw, SwitchCamera, X } from 'lucide-react';
import {
  computePixelCropRegion,
  updateCropRectByDrag,
  type CropDragMode,
  type NormalizedCropRect,
} from '../utils/crop';
import { mapClientDeltaToLocal } from '../utils/gesture';

interface CameraCropModalProps {
  isOpen: boolean;
  isRotatedLandscape: boolean;
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
  isRotatedLandscape,
  onClose,
  onConfirmCroppedFile,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
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

  if (!isOpen) return null;

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !isStreamReady) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

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
    const boxWidth = isRotatedLandscape ? rect.height : rect.width;
    const boxHeight = isRotatedLandscape ? rect.width : rect.height;

    dragStateRef.current = {
      pointerId: e.pointerId,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: cropRect,
      boxWidth: Math.max(1, boxWidth),
      boxHeight: Math.max(1, boxHeight),
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
    const rawDx = e.clientX - state.startClientX;
    const rawDy = e.clientY - state.startClientY;
    const { localDx, localDy } = mapClientDeltaToLocal(rawDx, rawDy, isRotatedLandscape);
    const dxNorm = localDx / state.boxWidth;
    const dyNorm = localDy / state.boxHeight;
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={captured ? 'Crop captured photo' : 'Camera capture'}
      className="absolute inset-0 z-50 bg-neutral-950/95 backdrop-blur-sm flex flex-col"
    >
      {/* Top Modal Header */}
      <div className="h-12 px-4 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between gap-4 shrink-0">
        <span className="text-xs font-semibold text-white tracking-tight">
          {captured ? 'Crop Photo' : 'Camera'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Center Stage: Live Camera OR Crop Frame */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden bg-black">
        {!captured ? (
          cameraError ? (
            <div className="max-w-sm text-center space-y-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
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
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                data-testid="camera-video"
                autoPlay
                playsInline
                muted
                className="max-w-full max-h-full rounded-xl bg-neutral-900 object-contain"
              />
              {isStartingCamera && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-xs text-slate-300 border border-slate-700">
                    Starting camera...
                  </span>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              ref={cropContainerRef}
              data-testid="crop-stage"
              style={{
                aspectRatio: `${captured.width} / ${captured.height}`,
                maxWidth: '100%',
                maxHeight: '100%',
              }}
              className="relative overflow-hidden rounded-lg select-none bg-neutral-900 shadow-2xl"
            >
              <img
                src={captured.dataUrl}
                alt="Captured camera preview"
                draggable={false}
                className="w-full h-full block object-fill pointer-events-none select-none"
              />

              {/* Interactive Crop Selection Box */}
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
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
                  touchAction: 'none',
                }}
                className="absolute border-2 border-amber-400 cursor-move"
              >
                {/* Rule-of-thirds guides */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-white/20" />
                  <div className="border-r border-white/20" />
                  <div />
                </div>

                {/* 4 Corner Resize Handles */}
                <button
                  type="button"
                  aria-label="Resize crop top-left"
                  onPointerDown={(e) => beginCropDrag('nw', e)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  style={{ touchAction: 'none' }}
                  className="absolute -left-2.5 -top-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 shadow cursor-nwse-resize"
                />
                <button
                  type="button"
                  aria-label="Resize crop top-right"
                  onPointerDown={(e) => beginCropDrag('ne', e)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  style={{ touchAction: 'none' }}
                  className="absolute -right-2.5 -top-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 shadow cursor-nesw-resize"
                />
                <button
                  type="button"
                  aria-label="Resize crop bottom-left"
                  onPointerDown={(e) => beginCropDrag('sw', e)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  style={{ touchAction: 'none' }}
                  className="absolute -left-2.5 -bottom-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 shadow cursor-nesw-resize"
                />
                <button
                  type="button"
                  aria-label="Resize crop bottom-right"
                  onPointerDown={(e) => beginCropDrag('se', e)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  style={{ touchAction: 'none' }}
                  className="absolute -right-2.5 -bottom-2.5 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-950 shadow cursor-nwse-resize"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Controls */}
      <div className="h-16 px-4 border-t border-slate-800 bg-slate-950/95 flex items-center justify-center gap-3 shrink-0">
        {!captured ? (
          <>
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              aria-label="Switch camera"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <SwitchCamera className="w-4 h-4" aria-hidden="true" />
              <span>Flip</span>
            </button>

            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={!isStreamReady}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>Capture</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retake</span>
            </button>

            <button
              type="button"
              onClick={() => setCropRect({ x: 0, y: 0, width: 1, height: 1 })}
              className="px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Full Frame
            </button>

            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>{isExporting ? 'Cropping...' : 'Crop & Place'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
