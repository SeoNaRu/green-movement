import type { GridCell } from "../grid/mapGrid.js";
import {
  BACKGROUND_COLOR,
  UFO_BEAM_DELAY_S,
  LIGHT_FADE_OUT_S,
  UFO_ENTRY_S,
  UFO_EXIT_S,
  SHEEP_CELL_TIME,
  SHEEP_FLOWER_COLORS,
} from "./constants.js";
import { buildContext } from "./buildContext.js";
import { planTargets } from "../planning/targetPlanner.js";
import { simulateGrid } from "../simulation/simulate.js";
import { buildTimeline } from "../timeline/schedules.js";
import { buildGrassLayer } from "./layers/grassLayer.js";
import { buildUfoLayer } from "./layers/ufoLayer.js";
import { buildSheepLayer } from "./layers/sheepLayer.js";
import { buildFlowerLayer, type FlowerSpot } from "./layers/flowerLayer.js";
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

/** circle.json 등: 키가 "row,col"(y,x) 형태면 grid 키 "x,y"로 변환. 그리드에 없는 칸(예: 53번째 주 미래일)은 제외 */
function paintMapToGridKeys(
  paintMap: Record<string, string>,
  byKey: Map<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, color] of Object.entries(paintMap)) {
    const parts = key.split(",").map(Number);
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    const gridKey = `${b},${a}`;
    if (byKey.has(gridKey)) out[gridKey] = color;
  }
  return out;
}

export function renderGridSvg(
  grid: GridCell[],
  options?: { paintMap?: Record<string, string> },
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
    maxSteps,
    dropStayS: DROP_STAY_S,
    minFunnelRow: plan.minFunnelRow,
    maxX: ctx.maxX,
    maxY: ctx.maxY,
    targetBfsLen: plan.targetBfsLen,
  });
  const timeline = buildTimeline(ctx, plan, sim);

  const paintMapRaw = options?.paintMap ?? {};
  const paintColors = paintMapToGridKeys(paintMapRaw, ctx.byKey);
  const paintTimes: Record<string, number> = {};
  const cx = timeline.paintCenterCol;
  const cy = timeline.paintCenterRow;
  for (const key of Object.keys(paintColors)) {
    const [x, y] = key.split(",").map(Number);
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    paintTimes[key] =
      timeline.paintSweepStartAbsSOffset + dist * timeline.paintWaveSpeedS;
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

  const {
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
  } = buildUfoLayer({
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
    maxX: ctx.maxX,
    maxY: ctx.maxY,
    pickupCells: timeline.pickupCells,
    pickupArriveAbsS: timeline.pickupArriveAbsSOffsetForUfo,
    pickupWaitS: PICKUP_WAIT_S,
    pickupLightS: PICKUP_LIGHT_S,
    sweepPositions: timeline.sweepPositions,
    sweepArriveAbsS: timeline.sweepArriveAbsSOffset,
    paintSweepDuration: timeline.paintSweepDuration,
    paintCenterCol: timeline.paintCenterCol,
    paintCenterRow: timeline.paintCenterRow,
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

  // 양이 밟은 빈 칸에만 꽃. 시각 = 그 칸에 실제로 도착한 시각(틱 끝·착지).
  // 같은 칸을 여러 양이 밟으면 각각 꽃 추가(데이지·코스모스 공존).
  const flowerListByCell = new Map<
    string,
    { appearTime: number; color: string }[]
  >();
  for (let i = 0; i < plan.sheepCount; i++) {
    const positions = sim.positionsHistory[i];
    if (!positions?.length) continue;

    const color = SHEEP_FLOWER_COLORS[i % SHEEP_FLOWER_COLORS.length];
    const readyAbsS = timeline.readyAbsSOffset[i]; // 착지(보이기 시작) 시각
    const moveStartAbsS = timeline.moveStartAbsSOffset[i];

    let firstMoveIdx = positions.length;
    for (let t = 1; t < positions.length; t++) {
      if (
        positions[t][0] !== positions[0][0] ||
        positions[t][1] !== positions[0][1]
      ) {
        firstMoveIdx = t;
        break;
      }
    }

    const FLOWER_POP_DELAY_S = 0.2;
    let prevKey: string | null = null;
    for (let t = 0; t < positions.length; t++) {
      if (t >= 1 && t < firstMoveIdx) continue;

      const [c, r] = positions[t];
      const key = `${c},${r}`;
      if (prevKey === key) continue;
      prevKey = key;

      const isGrassCell = (ctx.initialCountByKey.get(key) ?? 0) > 0;

      let appearTime: number;
      if (isGrassCell) {
        // 잔디 칸: 양이 먹고 떠난 뒤에 꽃이 피어남 (다음 칸 도착 시각 = 이 칸을 떠난 시각)
        let tLeave = positions.length;
        for (let k = t + 1; k < positions.length; k++) {
          if (positions[k][0] !== c || positions[k][1] !== r) {
            tLeave = k;
            break;
          }
        }
        const stepsFromFirstMove = tLeave - firstMoveIdx;
        appearTime = moveStartAbsS + stepsFromFirstMove * SHEEP_CELL_TIME;
      } else {
        // 빈 칸: 밟는 순간 기준 + 딜레이
        if (t === 0) {
          appearTime = readyAbsS;
        } else {
          const stepsFromFirstMove = t - firstMoveIdx;
          appearTime = moveStartAbsS + stepsFromFirstMove * SHEEP_CELL_TIME;
        }
      }
      appearTime += FLOWER_POP_DELAY_S;

      const v = Math.random() * 100;
      let count: number;
      if (v < 50) count = 1;
      else if (v < 80) count = 2;
      else if (v < 95) count = 3;
      else count = 4;

      const arr = flowerListByCell.get(key) ?? [];
      for (let n = 0; n < count; n++) {
        arr.push({ appearTime, color });
      }
      flowerListByCell.set(key, arr);
    }
  }
  const flowers: FlowerSpot[] = [];
  flowerListByCell.forEach((list, key) => {
    const [col, row] = key.split(",").map(Number);
    for (const { appearTime, color } of list) {
      flowers.push({ col, row, appearTime, color });
    }
  });
  const { flowerRects, flowerKeyframes } = buildFlowerLayer({
    flowers,
    gridLeftX: ctx.gridLeftX,
    gridTopY: ctx.gridTopY,
    maxTotalTime: timeline.maxTotalTimeWithEntryExit,
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
    flowerRects,
    flowerKeyframes,
    sheepGroups,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
    debugLayer,
    dotRects,
    grassFadeKeyframes,
    animationStyles,
    ufoKeyframesStr,
    ufoLightKeyframesStr,
  });
}
