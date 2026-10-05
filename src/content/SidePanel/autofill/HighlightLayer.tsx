import React, { useEffect, useState, useRef } from 'react';
import styles from './autofill.module.css';

export interface HighlightItem {
  element: Element;
  status?: 'hover' | 'filled' | 'skipped' | 'failed';
}

interface Props {
  items: HighlightItem[];
}

interface BoxRect {
  top: number;
  left: number;
  width: number;
  height: number;
  status: 'hover' | 'filled' | 'skipped' | 'failed';
}

/**
 * Renders bounding outlines in the extension's ShadowRoot without touching or styling
 * page DOM nodes. Continuously tracks element positions via requestAnimationFrame.
 */
export default function HighlightLayer({ items }: Props) {
  const [rects, setRects] = useState<BoxRect[]>([]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!items.length) {
      setRects([]);
      return;
    }

    const updateRects = () => {
      const computed: BoxRect[] = [];
      for (const item of items) {
        if (!item.element || !item.element.isConnected) continue;
        const r = item.element.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          computed.push({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            status: item.status ?? 'hover',
          });
        }
      }
      setRects(computed);
      animRef.current = requestAnimationFrame(updateRects);
    };

    animRef.current = requestAnimationFrame(updateRects);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [items]);

  if (!rects.length) return null;

  return (
    <>
      {rects.map((r, i) => {
        let statusClass = '';
        if (r.status === 'filled') statusClass = styles.highlightFilled;
        else if (r.status === 'skipped') statusClass = styles.highlightSkipped;
        else if (r.status === 'failed') statusClass = styles.highlightFailed;

        return (
          <div
            key={i}
            className={`${styles.highlightBox} ${statusClass}`}
            style={{
              top: `${r.top}px`,
              left: `${r.left}px`,
              width: `${r.width}px`,
              height: `${r.height}px`,
            }}
          />
        );
      })}
    </>
  );
}
