import { COLORS } from "./constants.js";

const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  S: ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

const MINI_GLYPHS: Record<string, string> = {
  A: "010111101", B: "110111110", C: "011100011", D: "110101110",
  E: "111110111", F: "111110100", G: "011101011", H: "101111101",
  I: "010010010", J: "001001110", K: "101110101", L: "100100111",
  M: "101111111", N: "110101011", O: "010101010", P: "110111100",
  Q: "111101011", R: "110111101", S: "011010110", T: "111010010",
  U: "101101111", V: "101101010", W: "111111101", X: "101010101",
  Y: "101010010", Z: "111010111", "0": "111101111", "1": "010110010",
  "2": "110011110", "3": "110011011", "4": "101111001", "5": "011110110",
  "6": "011110111", "7": "111001001", "8": "111111111", "9": "111111011",
  "-": "000111000",
};

export type SignatureCell = {
  key: string;
  color: string;
  order: number;
  phase: number;
};

export type GridWaveMetrics = {
  centerX: number;
  centerY: number;
  phaseScale: number;
  maxPhase: number;
};

export function getGridWaveMetrics(maxX: number, maxY: number): GridWaveMetrics {
  const centerX = maxX / 2;
  const centerY = maxY / 2;
  const phaseScale = 2;
  return {
    centerX,
    centerY,
    phaseScale,
    maxPhase: Math.round(
      Math.hypot(
        Math.max(centerX, maxX - centerX),
        Math.max(centerY, maxY - centerY),
      ) * phaseScale,
    ),
  };
}

export function getGridWavePhase(
  x: number,
  y: number,
  metrics: GridWaveMetrics,
): number {
  return Math.min(
    metrics.maxPhase,
    Math.round(
      Math.hypot(x - metrics.centerX, y - metrics.centerY) *
        metrics.phaseScale,
    ),
  );
}

/** 53×7 GitHub grid를 채우는 5×7, 3×5, 또는 두 줄 3×3 서명. */
export function buildSignatureCells(
  maxX: number,
  maxY: number,
  text = "SEONARU",
): SignatureCell[] {
  const normalized = text.trim().toUpperCase();
  const sourceGlyphs = [...normalized].map((letter) => GLYPHS[letter]);
  if (!normalized || sourceGlyphs.some((glyph) => glyph == null)) {
    throw new Error("Signature must contain only GitHub username characters: A-Z, 0-9, and hyphen");
  }
  if (sourceGlyphs.length > 26) {
    throw new Error(`Signature "${text}" is too long for a ${maxX + 1}x${maxY + 1} contribution grid (maximum 26 characters)`);
  }
  if (maxY + 1 < 7) return [];

  const compact = sourceGlyphs.length > 10;
  const glyphs = compact
    ? sourceGlyphs.map((glyph) =>
        [0, 1, 3, 5, 6].map((row) =>
          [0, 2, 4].map((col) => glyph[row][col]).join(""),
        ),
      )
    : sourceGlyphs;
  const letters = [...normalized];
  const split = Math.ceil(letters.length / 2);
  const miniGlyph = (letter: string) => {
    const bits = MINI_GLYPHS[letter];
    return [bits.slice(0, 3), bits.slice(3, 6), bits.slice(6, 9)];
  };
  const glyphLines = sourceGlyphs.length > 13
    ? [letters.slice(0, split).map(miniGlyph), letters.slice(split).map(miniGlyph)]
    : [glyphs];
  const availableWidth = maxX + 1;
  const glyphHeight = glyphLines[0][0].length;
  const lineGap = glyphLines.length > 1 ? 1 : 0;
  const totalHeight = glyphLines.length * glyphHeight + lineGap;
  const startY = Math.floor((maxY + 1 - totalHeight) / 2);
  const litCells: [number, number][] = [];

  glyphLines.forEach((line, lineIndex) => {
    const glyphWidth = line[0][0].length;
    const gap = line.length > 1
      ? Math.min(2, Math.floor((availableWidth - line.length * glyphWidth) / (line.length - 1)))
      : 0;
    const width = line.length * glyphWidth + Math.max(0, line.length - 1) * gap;
    if (gap < 0 || width > availableWidth) {
      throw new Error(`Signature "${text}" is too long for a ${availableWidth}x${maxY + 1} contribution grid (maximum 26 characters)`);
    }
    const startX = Math.floor((availableWidth - width) / 2);
    const glyphY = startY + lineIndex * (glyphHeight + lineGap);
    line.forEach((glyph, letterIndex) => {
      const glyphX = startX + letterIndex * (glyphWidth + gap);
      for (let row = 0; row < glyphHeight; row++) {
        for (let col = 0; col < glyphWidth; col++) {
          if (glyph[row][col] === "1") {
            litCells.push([glyphX + col, glyphY + row]);
          }
        }
      }
    });
  });

  const waveMetrics = getGridWaveMetrics(maxX, maxY);
  const distanceFromCenter = ([x, y]: [number, number]) =>
    Math.hypot(x - waveMetrics.centerX, y - waveMetrics.centerY);
  litCells.sort(
    (a, b) =>
      distanceFromCenter(a) - distanceFromCenter(b) ||
      a[0] - b[0] ||
      a[1] - b[1],
  );

  return litCells.map(([x, y], order) => ({
    key: `${x},${y}`,
    color: COLORS.LEVEL_4,
    order,
    phase: getGridWavePhase(x, y, waveMetrics),
  }));
}
