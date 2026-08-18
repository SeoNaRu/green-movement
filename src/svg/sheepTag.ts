export const SHEEP_TAG_CAPACITY = 360;

export const getSheepTagCode = (rosterIndex: number): number =>
  (Math.max(0, Math.floor(rosterIndex)) * 137 + 17) % SHEEP_TAG_CAPACITY;

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
  const color = getSheepTagCode(rosterIndex);
  return `<g class="sheep-ranch-tag${className ? ` ${className}` : ""}" data-ranch-tag="${color}" data-id-color="${color}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" shape-rendering="crispEdges"><rect width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="hsl(${color},72%,52%)" stroke="var(--gm-panel-bg)" stroke-width="${strokeWidth.toFixed(2)}"/></g>`;
}
