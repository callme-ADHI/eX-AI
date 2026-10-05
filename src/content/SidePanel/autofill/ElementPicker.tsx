import React, { useState, useEffect, useCallback } from 'react';
import { classifyPicked } from '../../autofill/detect';
import type { FieldHandle } from '../../autofill/types';
import styles from './autofill.module.css';

interface Props {
  ownHost: HTMLElement | null;
  onPick: (handle: FieldHandle) => void;
  onCancel: () => void;
}

export default function ElementPicker({ ownHost, onPick, onCancel }: Props) {
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Hover over an answerable input or question, click to pick (Esc to cancel)');

  const findTargetElement = useCallback(
    (x: number, y: number): Element | null => {
      const elements = document.elementsFromPoint(x, y);
      for (const el of elements) {
        if (ownHost && (ownHost === el || ownHost.contains(el))) continue;
        return el;
      }
      return null;
    },
    [ownHost],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const target = findTargetElement(e.clientX, e.clientY);
      if (target) {
        setHoveredRect(target.getBoundingClientRect());
      } else {
        setHoveredRect(null);
      }
    },
    [findTargetElement],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = findTargetElement(e.clientX, e.clientY);
      if (!target) {
        setStatusMessage('No target element found under cursor');
        return;
      }

      const handle = classifyPicked(target, ownHost);
      if (handle) {
        onPick(handle);
      } else {
        setStatusMessage('No answerable field found there. Try clicking the input, radio, or question label.');
      }
    },
    [findTargetElement, ownHost, onPick],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  return (
    <>
      <div
        className={styles.pickerOverlay}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      <div className={styles.pickerBanner} aria-live="polite">
        {statusMessage}
      </div>
      {hoveredRect && (
        <div
          className={styles.highlightBox}
          style={{
            top: `${hoveredRect.top}px`,
            left: `${hoveredRect.left}px`,
            width: `${hoveredRect.width}px`,
            height: `${hoveredRect.height}px`,
            borderColor: '#af52de',
            backgroundColor: 'rgba(175, 82, 222, 0.2)',
          }}
        />
      )}
    </>
  );
}
