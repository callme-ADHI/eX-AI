// ─── Crop Maths & PSM Hint Helpers ──────────────────────────────────────────

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropCoordinates {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes exact pixel coordinates on the full screenshot image.
 * Uses the ratio of image natural dimensions to viewport dimensions,
 * which correctly accounts for browser zoom, devicePixelRatio, and HiDPI.
 * Automatically normalises negative widths/heights and clamps to image bounds.
 */
export function computeCropCoordinates(
  selection: SelectionRect,
  viewportWidth: number,
  viewportHeight: number,
  naturalWidth: number,
  naturalHeight: number
): CropCoordinates {
  if (viewportWidth <= 0 || viewportHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }

  // Normalise selection (handle dragging right-to-left or bottom-to-top)
  const normX = selection.width < 0 ? selection.x + selection.width : selection.x;
  const normY = selection.height < 0 ? selection.y + selection.height : selection.y;
  const normW = Math.abs(selection.width);
  const normH = Math.abs(selection.height);

  const scaleX = naturalWidth / viewportWidth;
  const scaleY = naturalHeight / viewportHeight;

  let sx = Math.round(normX * scaleX);
  let sy = Math.round(normY * scaleY);
  let sw = Math.round(normW * scaleX);
  let sh = Math.round(normH * scaleY);

  // Clamp within image bounds
  sx = Math.max(0, Math.min(naturalWidth, sx));
  sy = Math.max(0, Math.min(naturalHeight, sy));
  sw = Math.max(0, Math.min(naturalWidth - sx, sw));
  sh = Math.max(0, Math.min(naturalHeight - sy, sh));

  return { sx, sy, sw, sh };
}

/**
 * Selects Page Segmentation Mode (PSM) hint based on selection size and shape.
 * PSM 6: Assume a single uniform block of text (default)
 * PSM 7: Treat the image as a single text line (for single-line queries or height < 60px)
 */
export function getPsmHint(selectionHeightCss: number, widthCss: number): number {
  if (selectionHeightCss < 60) {
    return 7; // Single text line
  }
  const ratio = widthCss / Math.max(1, selectionHeightCss);
  if (ratio > 5 && selectionHeightCss < 100) {
    return 7; // Wide banner / single line
  }
  return 6; // Single uniform block of text
}
