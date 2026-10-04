import { describe, it, expect } from 'vitest';
import { computeCropCoordinates, getPsmHint } from '../cropMath';

describe('Crop Coordinates Maths (cropMath.ts)', () => {
  it('computes exact 1:1 scale coordinates', () => {
    const coords = computeCropCoordinates(
      { x: 100, y: 150, width: 200, height: 250 },
      1000,
      800,
      1000,
      800
    );
    expect(coords).toEqual({
      sx: 100,
      sy: 150,
      sw: 200,
      sh: 250,
    });
  });

  it('scales coordinates accurately for 2x HiDPI displays', () => {
    const coords = computeCropCoordinates(
      { x: 100, y: 150, width: 200, height: 250 },
      1000,
      800,
      2000,
      1600
    );
    expect(coords).toEqual({
      sx: 200,
      sy: 300,
      sw: 400,
      sh: 500,
    });
  });

  it('handles negative drag widths/heights (dragging right-to-left or bottom-to-top)', () => {
    const coords = computeCropCoordinates(
      { x: 300, y: 400, width: -100, height: -150 },
      1000,
      800,
      1000,
      800
    );
    expect(coords).toEqual({
      sx: 200,
      sy: 250,
      sw: 100,
      sh: 150,
    });
  });

  it('clamps coordinates strictly within image boundaries', () => {
    const coords = computeCropCoordinates(
      { x: 950, y: 750, width: 200, height: 200 },
      1000,
      800,
      1000,
      800
    );
    expect(coords.sx).toBe(950);
    expect(coords.sy).toBe(750);
    expect(coords.sw).toBe(50); // clamped to 1000 - 950
    expect(coords.sh).toBe(50); // clamped to 800 - 750
  });

  it('handles non-integer zoom scale ratios (e.g. 125% browser zoom)', () => {
    // 1000 CSS px viewport -> 1250 physical px image
    const coords = computeCropCoordinates(
      { x: 100, y: 100, width: 400, height: 200 },
      1000,
      800,
      1250,
      1000
    );
    expect(coords).toEqual({
      sx: 125,
      sy: 125,
      sw: 500,
      sh: 250,
    });
  });
});

describe('Page Segmentation Mode Selection (getPsmHint)', () => {
  it('returns PSM 6 (uniform block) for normal selection blocks', () => {
    expect(getPsmHint(150, 300)).toBe(6);
    expect(getPsmHint(300, 400)).toBe(6);
  });

  it('returns PSM 7 (single line) for short selections (height < 60px)', () => {
    expect(getPsmHint(40, 200)).toBe(7);
    expect(getPsmHint(59, 500)).toBe(7);
  });

  it('returns PSM 7 for wide single-line banners', () => {
    expect(getPsmHint(70, 500)).toBe(7); // ratio > 7 and height < 100
  });
});
