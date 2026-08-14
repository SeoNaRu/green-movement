import type { GridCell } from "../grid/mapGrid.js";
import {
  BACKGROUND_COLOR,
  README_TARGET_WIDTH,
  UFO_BEAM_DELAY_S,
  LIGHT_FADE_OUT_S,
  UFO_ENTRY_S,
  UFO_EXIT_S,
} from "./constants.js";
import { buildContext } from "./buildContext.js";
import { planTargets } from "../planning/targetPlanner.js";
import { simulateGrid } from "./sim/simulate.js";
import { buildTimeline } from "../timeline/schedules.js";
import { buildGrassLayer } from "./anim/keyframes/grassKeyframes.js";
import { buildGrassCrumbsLayer } from "./layers/grassCrumbsLayer.js";
import { buildUfoLayer } from "./anim/keyframes/ufoKeyframes.js";
import { buildSheepLayer } from "./anim/keyframes/sheepKeyframes.js";
import { getCellCenterPx } from "./layout/gridLayout.js";
import { composeSvg } from "./render/composeSvg.js";
import { buildSignatureCells, getGridWaveMetrics } from "./signature.js";
import { buildFlockPlan } from "./flock.js";
import { buildFlockPanelLayer } from "./layers/flockPanelLayer.js";

const DROP_STAY_S = 0.14;
const LIGHT_RAMP_S = 0.04;
const SHEEP_FADE_S = 0.14;
const DROP_DESCENT_PX = 10;
const PICKUP_WAIT_S = 0.2;
const PICKUP_LIGHT_S = 0.14;
const PICKUP_FADE_S = 0.18;
const maxSteps = 24000;

export function renderGridSvg(
  grid: GridCell[],
  options?: {
    /** SVG 가로를 이 픽셀에 맞춤. 0이면 스케일 안 함. 기본값: README_TARGET_WIDTH */
    targetWidth?: number;
    /** 마지막 잔디 서명. GitHub 아이디는 두 줄 압축을 포함해 최대 26자. */
    signatureText?: string;
  },
): string {
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
    relayStartTick: plan.relayStartTick,
    maxSteps,
    dropStayS: DROP_STAY_S,
    minFunnelRow: plan.minFunnelRow,
    maxX: ctx.maxX,
    maxY: ctx.maxY,
    targetBfsLen: plan.targetBfsLen,
  });
  const flock = buildFlockPlan(plan, sim);
  const timeline = buildTimeline(ctx, plan, sim, flock);

  const signatureCells = buildSignatureCells(
    ctx.maxX,
    ctx.maxY,
    options?.signatureText,
  );
  const paintColors: Record<string, string> = {};
  const paintTimes: Record<string, number> = {};
  const maxPaintPhase = getGridWaveMetrics(ctx.maxX, ctx.maxY).maxPhase;
  const writeStep =
    maxPaintPhase > 0 ? timeline.paintSweepDuration / maxPaintPhase : 0;
  for (const cell of signatureCells) {
    paintColors[cell.key] = cell.color;
    paintTimes[cell.key] =
      timeline.paintSweepStartAbsSOffset + cell.phase * writeStep;
  }

  const { rects, grassFadeKeyframes } = buildGrassLayer({
    grid: ctx.grid,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    initialCountByKey: ctx.initialCountByKey,
    quartiles: ctx.quartiles,
    targetCellArrivals: timeline.firstArrivals,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    timeOffset: timeline.timelineOffset,
    paintColors: Object.keys(paintColors).length > 0 ? paintColors : undefined,
    paintTimes: Object.keys(paintTimes).length > 0 ? paintTimes : undefined,
  });

  const { crumbKeyframes, crumbGroup } = buildGrassCrumbsLayer({
    firstArrivals: timeline.firstArrivals,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    timeOffset: timeline.timelineOffset,
  });

  const {
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
  } = buildUfoLayer({
    funnelPositionsEarly: timeline.ufoStopCells,
    deploymentStopCount: plan.sheepCount,
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
    ufoEntryS: UFO_ENTRY_S,
    ufoExitS: UFO_EXIT_S,
    maxX: ctx.maxX,
    maxY: ctx.maxY,
    pickupCells: timeline.pickupCells,
    pickupArriveAbsS: timeline.pickupArriveAbsSOffsetForUfo,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
    sweepPositions: timeline.sweepPositions,
    sweepArriveAbsS: timeline.sweepArriveAbsSOffset,
    paintStartAbsS: timeline.paintSweepStartAbsSOffset,
    paintSweepDuration: timeline.paintSweepDuration,
    signatureCells: signatureCells.map(({ key }) =>
      key.split(",").map(Number) as [number, number],
    ),
    exitStartAbsS: timeline.ufoExitStartAbsSOffset,
    exitEndAbsS: timeline.ufoExitEndAbsSOffset,
  });

  const biteAbsSBySheep = Array.from(
    { length: plan.sheepCount },
    () => [] as number[],
  );
  const biteProgressBySheep = Array.from(
    { length: plan.sheepCount },
    () => [] as { atS: number; progress: number }[],
  );
  for (const arrival of timeline.firstArrivals.values()) {
    const atS = timeline.timelineOffset + arrival.arrivalTime;
    biteAbsSBySheep[arrival.sheepIndex]?.push(atS);
  }
  for (const sheep of timeline.flock.sheep) {
    for (const bite of sheep.bites) {
      biteProgressBySheep[sheep.slotIndex]?.push({
        atS: bite.atS,
        progress: bite.progress,
      });
    }
  }

  const { animationStyles, sheepGroups } = buildSheepLayer({
    positionsHistory: sim.positionsHistory,
    assignedIndices: timeline.assignedIndices,
    spawnAbsS: timeline.spawnAbsSOffset.slice(0, plan.sheepCount),
    moveStartAbsS: timeline.moveStartAbsSOffset.slice(0, plan.sheepCount),
    biteAbsSBySheep,
    biteProgressBySheep,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    lightRampS: LIGHT_RAMP_S,
    sheepFadeS: SHEEP_FADE_S,
    dropDescentPx: DROP_DESCENT_PX,
    pickupArriveAbsS: timeline.pickupArriveAbsSOffset,
    pickupFadeS: PICKUP_FADE_S,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
    turnovers: timeline.turnovers,
  });

  const { panelStyles, panelGroup } = buildFlockPanelLayer({
    flock: timeline.flock,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
    panelTop: ctx.baseHeight + 4,
    totalWidth: ctx.totalWidth,
  });

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

  const targetW = options?.targetWidth ?? README_TARGET_WIDTH;
  const displayWidth =
    targetW > 0 && ctx.totalWidth > 0 ? targetW : ctx.totalWidth;
  const displayHeight =
    targetW > 0 && ctx.totalWidth > 0
      ? Math.round(ctx.totalHeight * (targetW / ctx.totalWidth))
      : ctx.totalHeight;

  return composeSvg({
    totalWidth: ctx.totalWidth,
    totalHeight: ctx.totalHeight,
    viewBoxMinY,
    viewBoxHeight,
    displayWidth,
    displayHeight,
    backgroundColor: BACKGROUND_COLOR,
    fenceRects: ctx.fenceRects,
    rects,
    crumbKeyframes,
    crumbGroup,
    sheepGroups,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
    debugLayer,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    panelStyles,
    panelGroup,
  });
}
