// 시간 확장 예약 테이블 (셀·엣지 점유 상태)

export type CellKey = string;
export type EdgeKey = string;

export const cellKey = (c: number, r: number): CellKey => `${c},${r}`;
export const edgeKeyAtTime = (
  a: [number, number],
  b: [number, number],
): EdgeKey => `${a[0]},${a[1]}->${b[0]},${b[1]}`;

export type ReservationTable = {
  cell: Map<number, Map<CellKey, number>>;
  edge: Map<number, Map<EdgeKey, number>>;
};

export function createReservationTable(): ReservationTable {
  return { cell: new Map(), edge: new Map() };
}

export function getCellRes(
  res: ReservationTable,
  t: number,
): Map<CellKey, number> {
  let m = res.cell.get(t);
  if (!m) {
    m = new Map();
    res.cell.set(t, m);
  }
  return m;
}

export function getEdgeRes(
  res: ReservationTable,
  t: number,
): Map<EdgeKey, number> {
  let m = res.edge.get(t);
  if (!m) {
    m = new Map();
    res.edge.set(t, m);
  }
  return m;
}

export function isCellFree(
  res: ReservationTable,
  t: number,
  c: number,
  r: number,
  self: number,
): boolean {
  const m = res.cell.get(t);
  if (!m) return true;
  const occ = m.get(cellKey(c, r));
  return occ == null || occ === self;
}

export function reserveCell(
  res: ReservationTable,
  t: number,
  c: number,
  r: number,
  self: number,
): boolean {
  const m = getCellRes(res, t);
  const k = cellKey(c, r);
  const occ = m.get(k);
  if (occ != null && occ !== self) return false;
  m.set(k, self);
  return true;
}

export function reserveEdge(
  res: ReservationTable,
  t: number,
  from: [number, number],
  to: [number, number],
  self: number,
): boolean {
  const m = getEdgeRes(res, t);
  const fwd = edgeKeyAtTime(from, to);
  const rev = edgeKeyAtTime(to, from);
  const occF = m.get(fwd);
  const occR = m.get(rev);
  if ((occF != null && occF !== self) || (occR != null && occR !== self))
    return false;
  m.set(fwd, self);
  return true;
}

export function clearReservationsInRange(
  res: ReservationTable,
  self: number,
  tFrom: number,
  tTo: number,
): void {
  for (let t = tFrom; t <= tTo; t++) {
    const cm = res.cell.get(t);
    if (cm) {
      for (const [k, v] of cm) if (v === self) cm.delete(k);
    }
    const em = res.edge.get(t);
    if (em) {
      for (const [k, v] of em) if (v === self) em.delete(k);
    }
  }
}

/**
 * planWindowed 내부에서 edge 예약 미리보기용. 충돌 검사만.
 */
export function reserveEdgePreview(
  res: ReservationTable,
  t: number,
  from: [number, number],
  to: [number, number],
  self: number,
): boolean {
  const m = res.edge.get(t + 1);
  if (!m) return true;
  const fwd = edgeKeyAtTime(from, to);
  const rev = edgeKeyAtTime(to, from);
  const occF = m.get(fwd);
  const occR = m.get(rev);
  if ((occF != null && occF !== self) || (occR != null && occR !== self))
    return false;
  return true;
}
