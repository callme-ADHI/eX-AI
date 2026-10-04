// ─── Image Preprocessing Pipeline (OffscreenCanvas) ──────────────────────────

/**
 * Preprocesses cropped image before handing to Tesseract:
 * 1. Decode data URL to ImageBitmap
 * 2. Upscale small images (up to 4000px max)
 * 3. Grayscale conversion using Rec. 709 luma coefficients
 * 4. Auto-invert dark backgrounds (mean luminance < 110)
 * 5. Contrast stretch (1st to 99th percentile)
 * 6. Add 16px white border padding
 */
export async function preprocessImage(dataUrl: string): Promise<Blob> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  const origW = bitmap.width;
  const origH = bitmap.height;
  const longerSide = Math.max(origW, origH);
  const shorterSide = Math.min(origW, origH);

  // 2. Scale factor calculation
  let scale = 1;
  if (longerSide < 1600) {
    scale = shorterSide < 300 ? 3 : 2;
  }
  if (longerSide * scale > 4000) {
    scale = 4000 / longerSide;
  }

  const scaledW = Math.round(origW * scale);
  const scaledH = Math.round(origH * scale);

  // Canvas for scaling and image processing
  const canvas = new OffscreenCanvas(scaledW, scaledH);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, scaledW, scaledH);

  const imgData = ctx.getImageData(0, 0, scaledW, scaledH);
  const data = imgData.data;
  const pixelCount = scaledW * scaledH;

  // 3 & 4. Grayscale & Mean Luminance
  let totalLuma = 0;
  const gray = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    // Standard Rec. 709 coefficients
    const luma = Math.round(0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]);
    gray[i] = luma;
    totalLuma += luma;
  }

  const meanLuma = totalLuma / pixelCount;
  const shouldInvert = meanLuma < 110;

  if (shouldInvert) {
    for (let i = 0; i < pixelCount; i++) {
      gray[i] = 255 - gray[i];
    }
  }

  // 5. Contrast stretch (1st to 99th percentile)
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixelCount; i++) {
    histogram[gray[i]]++;
  }

  const p1Count = Math.floor(pixelCount * 0.01);
  const p99Count = Math.floor(pixelCount * 0.99);

  let accum = 0;
  let minP = 0;
  let maxP = 255;

  for (let val = 0; val < 256; val++) {
    accum += histogram[val];
    if (minP === 0 && accum >= p1Count) minP = val;
    if (accum >= p99Count) {
      maxP = val;
      break;
    }
  }

  const range = Math.max(1, maxP - minP);
  for (let i = 0; i < pixelCount; i++) {
    const v = gray[i];
    const stretched = Math.min(255, Math.max(0, Math.round(((v - minP) * 255) / range)));
    gray[i] = stretched;
  }

  // Put processed grayscale pixels back
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const val = gray[i];
    data[idx] = val;
    data[idx + 1] = val;
    data[idx + 2] = val;
    data[idx + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // 6. 16px white padding
  const PADDING = 16;
  const finalCanvas = new OffscreenCanvas(scaledW + PADDING * 2, scaledH + PADDING * 2);
  const finalCtx = finalCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  // Fill with solid white
  finalCtx.fillStyle = '#ffffff';
  finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  // Draw image centered
  finalCtx.drawImage(canvas, PADDING, PADDING);

  return finalCanvas.convertToBlob({ type: 'image/png' });
}
