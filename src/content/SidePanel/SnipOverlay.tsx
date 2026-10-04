import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { OCRMode } from '../../shared/aiTypes';
import { computeCropCoordinates, getPsmHint } from '../../shared/cropMath';

export interface SnipResult {
  dataUrl: string;
  thumbnail: string;
  mode: OCRMode;
  psmHint: number;
}

interface SnipOverlayProps {
  screenshotUrl: string;
  defaultMode?: OCRMode;
  onComplete: (result: SnipResult) => void;
  onCancel: () => void;
}

export default function SnipOverlay({
  screenshotUrl,
  defaultMode = 'text',
  onComplete,
  onCancel,
}: SnipOverlayProps) {
  const [mode, setMode] = useState<OCRMode>(defaultMode);
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Send OCR_WARM when overlay opens
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'OCR_WARM' }).catch(() => {});
  }, []);

  // Keyboard controls: T, C, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        setMode('text');
      } else if (e.key === 'c' || e.key === 'C') {
        setMode('code');
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onCancel]);

  // Window resize cancels the snip (since coordinates would shift)
  useEffect(() => {
    const handleResize = () => {
      onCancel();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onCancel]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    const x = Math.max(0, Math.min(window.innerWidth, e.clientX));
    const y = Math.max(0, Math.min(window.innerHeight, e.clientY));

    setIsDragging(true);
    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !startPoint) return;
    const x = Math.max(0, Math.min(window.innerWidth, e.clientX));
    const y = Math.max(0, Math.min(window.innerHeight, e.clientY));
    setCurrentPoint({ x, y });
  };

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !startPoint || !currentPoint || !imgRef.current) {
        setIsDragging(false);
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }

      setIsDragging(false);

      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      // Minimum selection check: 12x12 CSS px
      if (width < 12 || height < 12) {
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }

      const img = imgRef.current;
      if (!img) {
        onCancel();
        return;
      }
      const naturalW = img.naturalWidth > 0 ? img.naturalWidth : Math.round(window.innerWidth * (window.devicePixelRatio || 1));
      const naturalH = img.naturalHeight > 0 ? img.naturalHeight : Math.round(window.innerHeight * (window.devicePixelRatio || 1));

      const cropCoords = computeCropCoordinates(
        { x, y, width, height },
        window.innerWidth,
        window.innerHeight,
        naturalW,
        naturalH
      );

      if (cropCoords.sw <= 0 || cropCoords.sh <= 0) {
        onCancel();
        return;
      }

      // 1. Crop canvas
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropCoords.sw;
      cropCanvas.height = cropCoords.sh;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) {
        onCancel();
        return;
      }

      cropCtx.drawImage(
        img,
        cropCoords.sx,
        cropCoords.sy,
        cropCoords.sw,
        cropCoords.sh,
        0,
        0,
        cropCoords.sw,
        cropCoords.sh
      );

      const croppedDataUrl = cropCanvas.toDataURL('image/png');

      // 2. Thumbnail canvas (max 160px wide, JPEG 0.6)
      const thumbScale = Math.min(1, 160 / cropCoords.sw);
      const thumbW = Math.max(1, Math.round(cropCoords.sw * thumbScale));
      const thumbH = Math.max(1, Math.round(cropCoords.sh * thumbScale));

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbW;
      thumbCanvas.height = thumbH;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.drawImage(cropCanvas, 0, 0, thumbW, thumbH);
      }
      const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);

      const psmHint = getPsmHint(height, width);

      onComplete({
        dataUrl: croppedDataUrl,
        thumbnail: thumbDataUrl,
        mode,
        psmHint,
      });
    },
    [isDragging, startPoint, currentPoint, mode, onComplete, onCancel]
  );

  // Compute selection box coordinates for rendering
  let selLeft = 0;
  let selTop = 0;
  let selWidth = 0;
  let selHeight = 0;

  if (startPoint && currentPoint) {
    selLeft = Math.min(startPoint.x, currentPoint.x);
    selTop = Math.min(startPoint.y, currentPoint.y);
    selWidth = Math.abs(currentPoint.x - startPoint.x);
    selHeight = Math.abs(currentPoint.y - startPoint.y);
  }

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        cursor: 'crosshair',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Frozen screenshot image: object-fit: fill (viewport exact match) */}
      <img
        ref={imgRef}
        src={screenshotUrl}
        alt="Captured screen"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100vw',
          height: '100vh',
          objectFit: 'fill',
          pointerEvents: 'none',
        }}
      />

      {/* Semi-transparent dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          pointerEvents: 'none',
        }}
      />

      {/* Top Hint Bar */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 10, 14, 0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '30px',
          padding: '8px 20px',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      >
        <span>Drag to select area</span>
        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setMode('text')}
            style={{
              background: mode === 'text' ? 'rgba(36, 82, 255, 0.4)' : 'transparent',
              border: mode === 'text' ? '1px solid #7094ff' : '1px solid transparent',
              color: mode === 'text' ? '#ffffff' : 'rgba(232, 232, 240, 0.6)',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            [T] Text
          </button>
          <button
            onClick={() => setMode('code')}
            style={{
              background: mode === 'code' ? 'rgba(36, 82, 255, 0.4)' : 'transparent',
              border: mode === 'code' ? '1px solid #7094ff' : '1px solid transparent',
              color: mode === 'code' ? '#ffffff' : 'rgba(232, 232, 240, 0.6)',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            [C] Code
          </button>
        </div>
        <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>|</span>
        <span
          onClick={onCancel}
          style={{ cursor: 'pointer', color: 'rgba(255, 255, 255, 0.6)' }}
        >
          [Esc] Cancel
        </span>
      </div>

      {/* Active selection box with box-shadow mask */}
      {isDragging && selWidth > 0 && selHeight > 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${selLeft}px`,
            top: `${selTop}px`,
            width: `${selWidth}px`,
            height: `${selHeight}px`,
            border: '2px solid #3b82f6',
            boxShadow: '0 0 0 99999px rgba(0, 0, 0, 0.55)',
            pointerEvents: 'none',
          }}
        >
          {/* Dimension readout badge */}
          <div
            style={{
              position: 'absolute',
              bottom: '-24px',
              right: 0,
              background: 'rgba(10, 10, 14, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              color: '#ffffff',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {Math.round(selWidth)} × {Math.round(selHeight)}
          </div>
        </div>
      )}
    </div>
  );
}
