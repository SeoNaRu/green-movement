import type { GridCell } from "../grid/mapGrid.js";
import type { ReservationTable } from "./reservationTable.js";
import { cellKey } from "./reservationTable.js";

/**
 * 한 입구 칸에서 BFS, 길(빈 칸)만 확장.
 * 상하좌우 4방향만 사용 → 인접한 길이 없으면 그쪽으로는 확장 안 함(멈춤).
 */
export function emptyBfsFromGate(
  grid: GridCell[],
  maxX: number,
  maxY: number,
  startCol: number,
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

  const start: [number, number] = [startCol, 0];
  const cell = byKey.get(key(start[0], start[1]));
  if (cell && cell.count === 0) {
    visited.add(key(start[0], start[1]));
    parent.set(key(start[0], start[1]), null);
    emptyOrder.push(cell);
    queue.push(start);
  }

  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ];
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
 * 상하좌우 인접 여부 (한 칸만 차이)
 */
export function isAdjacent4(a: [number, number], b: [number, number]): boolean {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) === 1;
}

/**
 * path에서 currIdx보다 앞이면서 좌표가 currIdx와 다른 마지막 인덱스 (addCornerPause 중복 대비)
 */
export function findPrevDifferentIdx(
  path: [number, number][],
  currIdx: number,
): number {
  const [cc, cr] = path[currIdx] ?? [0, 0];
  for (let j = currIdx - 1; j >= 0; j--) {
    const [pc, pr] = path[j] ?? [0, 0];
    if (pc !== cc || pr !== cr) return j;
  }
  return Math.max(0, currIdx - 1);
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
 * 코너(방향이 바뀌는 칸)에서 한 틱 멈추도록 칸을 한 번 더 넣음 — 대각선 느낌·성급한 이동 방지
 * 예약/시간 플래닝 사용 시 비활성화 (중복 좌표로 충돌 증가 방지)
 */
export function addCornerPause(path: [number, number][]): [number, number][] {
  // 비활성화: 예약 기반 이동에서는 stay가 회전 멈칫을 대체
  return path;
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

/**
 * 잔디→잔디 경로 (빈 칸 + 두 잔디만 통과)
 */
export function pathBetweenGrassCells(
  firstGrass: GridCell,
  secondGrass: GridCell,
  emptyCellSet: Set<string>,
  maxX: number,
  maxY: number,
): [number, number][] {
  const allowed = new Set([
    ...emptyCellSet,
    `${firstGrass.x},${firstGrass.y}`,
    `${secondGrass.x},${secondGrass.y}`,
  ]);
  return pathBetweenCells(
    firstGrass.x,
    firstGrass.y,
    secondGrass.x,
    secondGrass.y,
    allowed,
    maxX,
    maxY,
  );
}
