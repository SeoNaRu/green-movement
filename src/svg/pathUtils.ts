import type { GridCell } from "../grid/mapGrid.js";

/**
 * 여러 시드 칸에서 BFS, 길(빈 칸)만 확장. UFO 드롭용: 게이트 없이 그리드 빈칸 전체 연결 성분.
 */
export function emptyBfsFromSeeds(
  grid: GridCell[],
  maxX: number,
  maxY: number,
  seeds: [number, number][],
): { emptyOrder: GridCell[]; parent: Map<string, string | null> } {
  const byKey = new Map<string, GridCell>();
  for (const c of grid) byKey.set(`${c.x},${c.y}`, c);

  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: [number, number][] = [];
  const emptyOrder: GridCell[] = [];

  const key = (col: number, row: number) => `${col},${row}`;
  const inBounds = (col: number, row: number) =>
    col >= 0 && col <= maxX && row >= 0 && row <= maxY;

  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];

  for (const [col, row] of seeds) {
    if (!inBounds(col, row) || visited.has(key(col, row))) continue;
    const cell = byKey.get(key(col, row));
    if (!cell || cell.count !== 0) continue;
    visited.add(key(col, row));
    parent.set(key(col, row), null);
    emptyOrder.push(cell);
    queue.push([col, row]);
  }

  while (queue.length > 0) {
    const [col, row] = queue.shift()!;
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (!inBounds(nc, nr) || visited.has(key(nc, nr))) continue;

      const next = byKey.get(key(nc, nr));
      if (!next || next.count !== 0) continue;

      visited.add(key(nc, nr));
      parent.set(key(nc, nr), key(col, row));
      emptyOrder.push(next);
      queue.push([nc, nr]);
    }
  }

  return { emptyOrder, parent };
}

/**
 * 경로에서 대각선(한 번에 2칸 이상) 제거: 인접하지 않은 연속 칸 사이에 중간 칸 삽입 → 4방향만
 */
export function ensureOnly4Direction(
  path: [number, number][],
): [number, number][] {
  if (path.length <= 1) return path;
  const out: [number, number][] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [c0, r0] = path[i - 1];
    const [c1, r1] = path[i];
    if (c0 === c1 && r0 === r1) continue;
    let cx = c0;
    let rx = r0;
    do {
      if (cx !== c1) cx += c1 > cx ? 1 : -1;
      else if (rx !== r1) rx += r1 > rx ? 1 : -1;
      out.push([cx, rx]);
    } while (cx !== c1 || rx !== r1);
  }
  return out;
}

/**
 * BFS parent 맵으로 시작→목표 경로 추적 (셀 리스트 반환)
 */
export function tracePath(
  targetCol: number,
  targetRow: number,
  parent: Map<string, string | null>,
): [number, number][] {
  const path: [number, number][] = [];
  let key: string | null = `${targetCol},${targetRow}`;
  while (key !== null) {
    const [c, r] = key.split(",").map(Number);
    path.unshift([c, r]);
    key = parent.get(key) ?? null;
  }
  return path;
}

/**
 * BFS로 두 칸 사이 경로 (allowedSet 안의 칸만 통과). 4방향.
 */
export function pathBetweenCells(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  allowedSet: Set<string>,
  maxX: number,
  maxY: number,
): [number, number][] {
  const key = (c: number, r: number) => `${c},${r}`;
  const allowed = (c: number, r: number) =>
    c >= 0 && c <= maxX && r >= 0 && r <= maxY && allowedSet.has(key(c, r));
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: [number, number][] = [[fromCol, fromRow]];
  visited.add(key(fromCol, fromRow));
  parent.set(key(fromCol, fromRow), null);
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
  const targetK = key(toCol, toRow);
  while (queue.length > 0) {
    const [col, row] = queue.shift()!;
    if (col === toCol && row === toRow) break;
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      const nk = key(nc, nr);
      if (!allowed(nc, nr) || visited.has(nk)) continue;
      visited.add(nk);
      parent.set(nk, key(col, row));
      queue.push([nc, nr]);
    }
  }
  if (!visited.has(targetK)) return [];
  return tracePath(toCol, toRow, parent);
}
