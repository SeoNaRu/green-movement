import { COLORS } from "./constants.js";

/**
 * Calculate contribution level using quartiles (GitHub's actual algorithm)
 * 0: no contributions
 * 1-4: quartiles of non-zero contributions
 */
export function getContributionLevel(
  count: number,
  quartiles: number[],
): number {
  if (count === 0) return 0;
  if (count < quartiles[0]) return 1;
  if (count < quartiles[1]) return 2;
  if (count < quartiles[2]) return 3;
  return 4;
}

export function getColor(level: number): string {
  switch (level) {
    case 0:
      return COLORS.LEVEL_0;
    case 1:
      return COLORS.LEVEL_1;
    case 2:
      return COLORS.LEVEL_2;
    case 3:
      return COLORS.LEVEL_3;
    case 4:
      return COLORS.LEVEL_4;
    default:
      return COLORS.LEVEL_0;
  }
}

/**
 * Calculate quartiles from non-zero contribution counts
 */
export function calculateQuartiles(counts: number[]): number[] {
  const nonZero = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length === 0) return [0, 0, 0];

  const q1 = nonZero[Math.floor(nonZero.length * 0.25)] || 1;
  const q2 = nonZero[Math.floor(nonZero.length * 0.5)] || 1;
  const q3 = nonZero[Math.floor(nonZero.length * 0.75)] || 1;

  return [q1, q2, q3];
}
