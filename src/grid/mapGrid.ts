import type { ContributionDay } from "../github/fetchGrid.js";

export type GridCell = {
  x: number;
  y: number;
  count: number;
  date: string;
};

/** 0 = Sunday, 6 = Saturday (UTC) */
function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay();
}

/**
 * Convert raw weeks (2D) into a flat array of GridCell with explicit coordinates.
 * x = week index, y = day of week from date (0 = Sunday, 6 = Saturday).
 * Fills missing (x, y) with count 0 so the grid is always 7 rows per column.
 * For the current week (last column), only shows days up to today.
 */
export function mapGrid(weeks: ContributionDay[][]): GridCell[] {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return [];
  }
  const byKey = new Map<string, GridCell>();

  for (let x = 0; x < weeks.length; x++) {
    const week = weeks[x];
    for (const day of week) {
      const y = dayOfWeek(day.date);
      byKey.set(`${x},${y}`, { x, y, count: day.count, date: day.date });
    }
  }

  const cells: GridCell[] = [];
  const maxX = weeks.length - 1;
  const todayDayOfWeek = new Date().getUTCDay();

  for (let x = 0; x <= maxX; x++) {
    const isLastWeek = x === maxX;
    const maxY = isLastWeek ? todayDayOfWeek : 6;

    for (let y = 0; y <= maxY; y++) {
      const key = `${x},${y}`;
      cells.push(byKey.get(key) ?? { x, y, count: 0, date: "" });
    }
  }
  return cells;
}
