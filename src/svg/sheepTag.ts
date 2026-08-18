const TAG_CODES = Array.from({ length: 511 }, (_, index) => index + 1).filter(
  (code) => {
    let bits = 0;
    for (let value = code; value > 0; value >>= 1) bits += value & 1;
    return bits >= 2 && bits <= 7;
  },
);

export const SHEEP_TAG_CAPACITY = TAG_CODES.length;

export const getSheepTagCode = (rosterIndex: number): number =>
  TAG_CODES[Math.max(0, Math.floor(rosterIndex)) % SHEEP_TAG_CAPACITY];

export function buildSheepTagSvg(params: {
  rosterIndex: number;
  x: number;
  y: number;
  size: number;
  className?: string;
  strokeWidth?: number;
}): string {
  const { rosterIndex, x, y, size, className = "", strokeWidth = size * 0.08 } =
    params;
  const code = getSheepTagCode(rosterIndex);
  const inset = size * 0.17;
  const gap = size * 0.055;
  const cell = (size - inset * 2 - gap * 2) / 3;
  const pixels = Array.from({ length: 9 }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    return `<rect x="${(inset + column * (cell + gap)).toFixed(2)}" y="${(inset + row * (cell + gap)).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${code & (1 << index) ? "var(--gm-level-4)" : "var(--gm-panel-track)"}"/>`;
  }).join("");
  return `<g class="sheep-ranch-tag${className ? ` ${className}` : ""}" data-ranch-tag="${code}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" shape-rendering="crispEdges"><rect width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="var(--gm-panel-bg)" stroke="var(--gm-level-3)" stroke-width="${strokeWidth.toFixed(2)}"/>${pixels}</g>`;
}
