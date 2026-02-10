import type { GridCell } from "../grid/mapGrid.js";
import {
  BACKGROUND_COLOR,
  UFO_BEAM_DELAY_S,
  LIGHT_FADE_OUT_S,
  UFO_ENTRY_S,
  UFO_EXIT_S,
} from "./constants.js";
import { buildContext } from "./buildContext.js";
import { planTargets } from "../planning/targetPlanner.js";
import { simulateGrid } from "../simulation/simulate.js";
import { buildTimeline } from "../timeline/schedules.js";
import { buildGrassLayer } from "./layers/grassLayer.js";
import { buildUfoLayer } from "./layers/ufoLayer.js";
import { buildSheepLayer } from "./layers/sheepLayer.js";
import { getCellCenterPx } from "./gridLayout.js";
import { composeSvg } from "./render/composeSvg.js";

const DROP_STAY_S = 0.25;
const LIGHT_RAMP_S = 0.08;
const SHEEP_FADE_S = 0.25;
const DROP_DESCENT_PX = 0;
const MOVE_START_S = Math.max(DROP_STAY_S, LIGHT_RAMP_S + SHEEP_FADE_S);
const PICKUP_WAIT_S = 0.35;
const PICKUP_LIGHT_S = 0.22;
const PICKUP_FADE_S = 0.25;
const maxSteps = 24000;

/** 디버그용: 지정한 칸 중앙에 점 찍기. 0-based. 빈 배열 []이면 점 없음 */
const CELL_DOTS: [col: number, row: number][] = [];

export function renderGridSvg(grid: GridCell[]): string {
  if (grid.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>`;
  }

  const ctx = buildContext(grid);
  const plan = planTargets(ctx);
  const sim = simulateGrid({
    grid: ctx.grid,
    byKey: ctx.byKey,
    initialCountByKey: ctx.initialCountByKey,
    quartiles: ctx.quartiles,
    emptyCellSet: plan.emptyCellSet,
    remainingGrassKeys: plan.remainingGrassKeys,
    sheepStates: plan.sheepStates,
    sheepCount: plan.sheepCount,
    spawnTick: plan.spawnTick,
    maxSteps,
    dropStayS: DROP_STAY_S,
    minFunnelRow: plan.minFunnelRow,
    maxX: ctx.maxX,
    maxY: ctx.maxY,
    targetBfsLen: plan.targetBfsLen,
  });
  const timeline = buildTimeline(ctx, plan, sim);

  const { rects, grassFadeKeyframes } = buildGrassLayer({
    grid: ctx.grid,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    initialCountByKey: ctx.initialCountByKey,
    quartiles: ctx.quartiles,
    targetCellArrivals: timeline.firstArrivals,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    timeOffset: timeline.timelineOffset,
  });

  const { ufoKeyframesStr, ufoLightKeyframesStr, ufoGroupStr } = buildUfoLayer({
    funnelPositionsEarly: plan.funnelPositionsEarly,
    spawnAbsS: timeline.spawnAbsSOffset,
    arriveAbsS: timeline.ufoArriveAbsSOffset,
    beamDelayS: UFO_BEAM_DELAY_S,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    lightRampS: LIGHT_RAMP_S,
    lightFadeOutS: LIGHT_FADE_OUT_S,
    moveStartAbsS: timeline.moveStartAbsSOffset,
    ufoLeaveAbsS: timeline.ufoLeaveAbsSOffset,
    readyAbsS: timeline.readyAbsSOffset,
    ufoEntryS: UFO_ENTRY_S,
    ufoExitS: UFO_EXIT_S,
    pickupCells: timeline.pickupCells,
    pickupArriveAbsS: timeline.pickupArriveAbsSOffsetForUfo,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
  });

  const { animationStyles, sheepGroups } = buildSheepLayer({
    positionsHistory: sim.positionsHistory,
    assignedIndices: timeline.assignedIndices,
    spawnAbsS: timeline.spawnAbsSOffset,
    moveStartAbsS: timeline.moveStartAbsSOffset,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    dropStayS: DROP_STAY_S,
    lightRampS: LIGHT_RAMP_S,
    sheepFadeS: SHEEP_FADE_S,
    dropDescentPx: DROP_DESCENT_PX,
    moveStartS: MOVE_START_S,
    pickupArriveAbsS: timeline.pickupArriveAbsSOffset,
    pickupFadeS: PICKUP_FADE_S,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
  });

  const dotRects = CELL_DOTS.map(([col, row]) => {
    const { x, y } = getCellCenterPx(ctx.gridLeftX, ctx.gridTopY, col, row);
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="#ff4444"/>`;
  }).join("\n  ");

  const DEBUG_LAYER = process.env?.DEBUG_SVG === "1";
  const debugLayer = DEBUG_LAYER
    ? `<g opacity="0.9">${plan.funnelPositionsEarly
        .map((pos, i) => {
          const { x, y } = getCellCenterPx(
            ctx.gridLeftX,
            ctx.gridTopY,
            pos[0],
            pos[1],
          );
          return `<g><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#00ff88" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="1.5" fill="#00ff88"/><text x="${x + 6}" y="${y - 6}" font-size="6" fill="#00ff88">U${i}</text></g>`;
        })
        .join("")}</g>`
    : "";

  const viewBoxMinY = 0;
  const viewBoxHeight = ctx.totalHeight;

  return composeSvg({
    totalWidth: ctx.totalWidth,
    totalHeight: ctx.totalHeight,
    viewBoxMinY,
    viewBoxHeight,
    backgroundColor: BACKGROUND_COLOR,
    fenceRects: ctx.fenceRects,
    rects,
    sheepGroups,
    ufoGroupStr,
    debugLayer,
    dotRects,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
  });
}
