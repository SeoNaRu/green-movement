import type { GridCell } from "../../../grid/mapGrid.js";
import {
  CELL_SIZE,
  GAP,
  BORDER_RADIUS,
  COLORS,
  GRASS_STEP_TIMES_S,
} from "../../constants.js";
import { getContributionLevel, getColor } from "../../contribution.js";

export function buildGrassLayer(params: {
  grid: GridCell[];
  gridLeftX: number;
  gridTopY: number;
  initialCountByKey: Map<string, number>;
  quartiles: number[];
  targetCellArrivals: Map<string, { arrivalTime: number; level: number }>;
  maxTotalTime: number;
  timeOffset?: number;
  paintColors?: Record<string, string>;
  paintTimes?: Record<string, number>;
}): { rects: string; grassFadeKeyframes: string } {
  const {
    grid,
    gridLeftX,
    gridTopY,
    initialCountByKey,
    quartiles,
    targetCellArrivals,
    maxTotalTime,
    timeOffset = 0,
    paintColors = {},
    paintTimes = {},
  } = params;

  const grassLoopKeyframes: string[] = [];
  const rects = grid
    .map((cell, cellIndex) => {
      const px = gridLeftX + cell.x * (CELL_SIZE + GAP);
      const py = gridTopY + cell.y * (CELL_SIZE + GAP);
      const key = `${cell.x},${cell.y}`;
      const initialCount = initialCountByKey.get(key) ?? cell.count;
      const level = getContributionLevel(initialCount, quartiles);
      const initialColor = getColor(level);
      const paintColor = paintColors[key];
      const paintTime = paintTimes[key];
      const arrivals = targetCellArrivals.get(key);

      if (arrivals) {
        const startLevel = Math.max(1, arrivals.level);
        const fill = getColor(startLevel);
        const eatingStart = timeOffset + arrivals.arrivalTime;
        const kfName = `grass-loop-${cellIndex}`;
        const steps = Math.min(startLevel, GRASS_STEP_TIMES_S.length);
        const entries: string[] = [`0% { fill: ${fill}; }`];
        for (let i = 0; i < steps; i++) {
          const t = eatingStart + GRASS_STEP_TIMES_S[i];
          const pct = Math.min(99.98, (t / maxTotalTime) * 100);
          const currentColor = getColor(startLevel - i);
          const nextColor = getColor(startLevel - i - 1);
          entries.push(`${pct.toFixed(4)}% { fill: ${currentColor}; }`);
          entries.push(`${(pct + 0.01).toFixed(4)}% { fill: ${nextColor}; }`);
        }
        if (paintColor != null && paintTime != null) {
          const paintPct = Math.min(
            99.99,
            Math.max(
              ((eatingStart + (GRASS_STEP_TIMES_S[steps - 1] ?? 0)) /
                maxTotalTime) *
                100 +
                0.02,
              (paintTime / maxTotalTime) * 100,
            ),
          );
          grassLoopKeyframes.push(`
  @keyframes ${kfName} {
    ${entries.join("\n    ")}
    ${paintPct.toFixed(4)}% { fill: ${COLORS.LEVEL_0}; }
    ${(paintPct + 0.01).toFixed(4)}% { fill: ${paintColor}; }
    100% { fill: ${paintColor}; }
  }`);
        } else {
          entries.push(`100% { fill: ${COLORS.LEVEL_0}; }`);
          grassLoopKeyframes.push(`
  @keyframes ${kfName} {
    ${entries.join("\n    ")}
  }`);
        }
        const anim = `animation: ${kfName} ${maxTotalTime}s linear 0s 1 both`;
        return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${fill}" rx="${BORDER_RADIUS}" style="${anim}"/>`;
      }

      if (paintColor != null && paintTime != null) {
        const pct = Math.min(99.99, (paintTime / maxTotalTime) * 100);
        const kfName = `grass-paint-${cellIndex}`;
        grassLoopKeyframes.push(`
  @keyframes ${kfName} {
    0% { fill: ${initialColor}; }
    ${pct.toFixed(4)}% { fill: ${initialColor}; }
    ${(pct + 0.01).toFixed(4)}% { fill: ${paintColor}; }
    100% { fill: ${paintColor}; }
  }`);
        const anim = `animation: ${kfName} ${maxTotalTime}s linear 0s 1 both`;
        return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${initialColor}" rx="${BORDER_RADIUS}" style="${anim}"/>`;
      }
      return `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${initialColor}" rx="${BORDER_RADIUS}"/>`;
    })
    .join("\n  ");

  return { rects, grassFadeKeyframes: grassLoopKeyframes.join("") };
}
