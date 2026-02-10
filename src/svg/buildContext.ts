import type { GridCell } from "../grid/mapGrid.js";
import { CELL_SIZE, GAP, FENCE_TILE, FENCE_MARGIN } from "./constants.js";
import { buildFencePieces } from "./gridLayout.js";
import { emptyBfsFromSeeds } from "./pathUtils.js";
import { calculateQuartiles } from "./contribution.js";

export type GridContext = {
  grid: GridCell[];
  maxX: number;
  maxY: number;
  gridLeftX: number;
  gridTopY: number;
  gridRightX: number;
  gridBottomY: number;
  fenceRightX: number;
  fenceBottomY: number;
  totalWidth: number;
  baseHeight: number;
  centerCol: number;
  byKey: Map<string, GridCell>;
  initialCountByKey: Map<string, number>;
  sheepCountCap: number;
  inBounds: (col: number, row: number) => boolean;
  dirs4: [number, number][];
  keyOf: (c: number, r: number) => string;
  recomputeReachableEmptyFromSeeds: () => Set<string>;
  quartiles: number[];
  fenceRects: string;
  totalHeight: number;
};

export function buildContext(grid: GridCell[]): GridContext {
  const maxX = Math.max(...grid.map((c) => c.x));
  const maxY = Math.max(...grid.map((c) => c.y));
  const gridWidth = (maxX + 1) * (CELL_SIZE + GAP);
  const gridHeight = (maxY + 1) * (CELL_SIZE + GAP);
  const gridLeftX = FENCE_MARGIN;
  const gridTopY = FENCE_MARGIN;
  const gridRightX = gridLeftX + gridWidth;
  const gridBottomY = gridTopY + gridHeight;
  const fenceRightX = gridRightX;
  const fenceBottomY = gridBottomY;
  const totalWidth = fenceRightX + FENCE_TILE;
  const baseHeight = fenceBottomY + FENCE_TILE;
  const centerCol = Math.floor(maxX / 2);

  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);
  const initialCountByKey = new Map<string, number>();
  for (const c of grid) initialCountByKey.set(`${c.x},${c.y}`, c.count);
  const grassCells = grid.filter(
    (c) => (initialCountByKey.get(`${c.x},${c.y}`) ?? 0) > 0,
  );

  const sheepCountCap = (() => {
    const grassCount = grassCells.length;
    if (grassCount <= 0) return 0;
    const base = Math.floor(grassCount / 3);
    const minSheepIfAnyGrass = Math.min(5, grassCount);
    return Math.min(40, Math.max(base, minSheepIfAnyGrass));
  })();

  const inBounds = (col: number, row: number) =>
    col >= 0 && col <= maxX && row >= 0 && row <= maxY;
  const dirs4: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  const keyOf = (c: number, r: number) => `${c},${r}`;

  function recomputeReachableEmptyFromSeeds(): Set<string> {
    const seeds: [number, number][] = [];
    for (let r = 0; r <= maxY; r++) {
      for (let c = 0; c <= maxX; c++) {
        const cell = byKey.get(keyOf(c, r));
        if (!cell || cell.count !== 0) continue;
        for (const [dc, dr] of dirs4) {
          const nc = c + dc;
          const nr = r + dr;
          if (!inBounds(nc, nr)) continue;
          const neighbor = byKey.get(keyOf(nc, nr));
          if (neighbor && neighbor.count > 0) {
            seeds.push([c, r]);
            break;
          }
        }
      }
    }
    if (seeds.length === 0) {
      for (const c of grid) {
        if (c.count === 0) seeds.push([c.x, c.y]);
      }
    }
    const { emptyOrder } = emptyBfsFromSeeds(grid, maxX, maxY, seeds);
    const out = new Set<string>();
    for (const cell of emptyOrder) out.add(keyOf(cell.x, cell.y));
    return out;
  }

  const allCounts = grid.map((c) => c.count);
  const quartiles = calculateQuartiles(allCounts);
  const fenceRects = buildFencePieces({ fenceRightX, fenceBottomY });
  const totalHeight = baseHeight;

  return {
    grid,
    maxX,
    maxY,
    gridLeftX,
    gridTopY,
    gridRightX,
    gridBottomY,
    fenceRightX,
    fenceBottomY,
    totalWidth,
    baseHeight,
    centerCol,
    byKey,
    initialCountByKey,
    sheepCountCap,
    inBounds,
    dirs4,
    keyOf,
    recomputeReachableEmptyFromSeeds,
    quartiles,
    fenceRects,
    totalHeight,
  };
}
