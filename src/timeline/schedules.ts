import type { GridContext } from "../svg/buildContext.js";
import type { PlanResult } from "../planning/types.js";
import type { SimulationResult } from "../simulation/simulate.js";
import type { TimelineResult } from "./types.js";
import {
  SHEEP_CELL_TIME,
  UFO_ENTRY_S,
  UFO_EXIT_S,
  LIGHT_FADE_OUT_S,
  UFO_CELL_TIME,
  UFO_MOVE_MIN_S,
  UFO_MOVE_MAX_S,
} from "../svg/constants.js";

const LIGHT_RAMP_S = 0.08;
const SHEEP_FADE_S = 0.25;
const DROP_STAY_S = 0.25;
const MOVE_START_S = Math.max(DROP_STAY_S, LIGHT_RAMP_S + SHEEP_FADE_S);
const MAX_VISUAL_EXTRA_S = 0.25;
const DROP_WAIT_S = 0.15;
const PICKUP_WAIT_S = 0.35;
const PICKUP_LIGHT_S = 0.22;
const PICKUP_FADE_S = 0.25;

/** 타이밍 정책: 필요 시 교체 가능 (기본값 사용) */
export interface TimingPolicy {
  sheepCellTime: number;
  ufoEntryS: number;
  ufoExitS: number;
  lightRampS: number;
  sheepFadeS: number;
  dropStayS: number;
  moveStartS: number;
}

const defaultTiming: TimingPolicy = {
  sheepCellTime: SHEEP_CELL_TIME,
  ufoEntryS: UFO_ENTRY_S,
  ufoExitS: UFO_EXIT_S,
  lightRampS: LIGHT_RAMP_S,
  sheepFadeS: SHEEP_FADE_S,
  dropStayS: DROP_STAY_S,
  moveStartS: MOVE_START_S,
};

export function buildTimeline(
  ctx: GridContext,
  plan: PlanResult,
  sim: SimulationResult,
  policy?: Partial<TimingPolicy>,
): TimelineResult {
  const timing = { ...defaultTiming, ...policy };
  const {
    sheepCount,
    funnelPositionsEarly,
    spawnTick,
    sheepTargetsWithEmpty,
    paths,
  } = plan;
  const { positionsHistory, targetCellArrivals, maxTotalTime } = sim;
  const { initialCountByKey } = ctx;

  const moveStartAbsS = Array.from({ length: sheepCount }, (_, i) => {
    const timeline = positionsHistory[i];
    if (!timeline || timeline.length === 0) {
      return spawnTick[i] * timing.sheepCellTime + timing.moveStartS;
    }
    const [sx, sy] = timeline[0];
    let firstMoveIdx = -1;
    for (let t = 1; t < timeline.length; t++) {
      const [x, y] = timeline[t];
      if (x !== sx || y !== sy) {
        firstMoveIdx = t;
        break;
      }
    }
    const simExtra =
      firstMoveIdx < 0
        ? (timeline.length - 1) * timing.sheepCellTime
        : (firstMoveIdx - 1) * timing.sheepCellTime;
    const extra = Math.min(MAX_VISUAL_EXTRA_S, Math.max(0, simExtra));
    return spawnTick[i] * timing.sheepCellTime + timing.moveStartS + extra;
  });

  const simSpawnAbsS = spawnTick.map((t) => t * timing.sheepCellTime);
  const visualSpawnAbsS: number[] = new Array(sheepCount).fill(0);
  const readyAbsS: number[] = new Array(sheepCount).fill(0);
  const visualMoveStartAbsS: number[] = new Array(sheepCount).fill(0);
  const sheepFirstGrassArrivalS: number[] = new Array(sheepCount).fill(
    Infinity,
  );
  const ufoArriveAbsS: number[] = new Array(sheepCount).fill(0);
  const ufoLeaveAbsS: number[] = new Array(sheepCount).fill(0);

  const activeSheepIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter((i) => (positionsHistory[i]?.length ?? 0) > 0);

  const pickupArriveBySheep: (number | null)[] = Array.from(
    { length: sheepCount },
    () => null,
  );
  const pickupCells: [number, number][] = activeSheepIndices.map((i) => {
    const tl = positionsHistory[i]!;
    const last = tl[tl.length - 1];
    return [last[0], last[1]];
  });
  const sheepEndAbsSActive = activeSheepIndices.map((i) => {
    const tl = positionsHistory[i]!;
    return (
      spawnTick[i] * timing.sheepCellTime +
      (tl.length - 1) * timing.sheepCellTime
    );
  });

  for (let i = 0; i < sheepCount; i++) {
    const prevLeave = i === 0 ? 0 : ufoLeaveAbsS[i - 1];
    let arrive = prevLeave;
    if (i >= 1 && funnelPositionsEarly[i] && funnelPositionsEarly[i - 1]) {
      const distCells =
        Math.abs(funnelPositionsEarly[i][0] - funnelPositionsEarly[i - 1][0]) +
        Math.abs(funnelPositionsEarly[i][1] - funnelPositionsEarly[i - 1][1]);
      const travelS = Math.min(
        UFO_MOVE_MAX_S,
        Math.max(UFO_MOVE_MIN_S, distCells * UFO_CELL_TIME),
      );
      arrive = prevLeave + travelS;
    }
    ufoArriveAbsS[i] = arrive;
    const baseSpawn = arrive + DROP_WAIT_S;
    visualSpawnAbsS[i] = Math.max(simSpawnAbsS[i] ?? 0, baseSpawn);
    readyAbsS[i] = visualSpawnAbsS[i] + (timing.lightRampS + timing.sheepFadeS);
    const simOffset = (moveStartAbsS[i] ?? 0) - (simSpawnAbsS[i] ?? 0);
    visualMoveStartAbsS[i] = Math.max(
      readyAbsS[i],
      visualSpawnAbsS[i] + Math.max(0, simOffset),
    );
    const timeline = positionsHistory[i];
    if (timeline?.length) {
      for (let idx = 0; idx < timeline.length; idx++) {
        const [c, r] = timeline[idx];
        const key = `${c},${r}`;
        if ((initialCountByKey.get(key) ?? 0) > 0) {
          sheepFirstGrassArrivalS[i] =
            (visualSpawnAbsS[i] ?? 0) + idx * timing.sheepCellTime;
          break;
        }
      }
    }
    ufoLeaveAbsS[i] = (visualMoveStartAbsS[i] ?? 0) + LIGHT_FADE_OUT_S;
  }

  const allSheepDoneAbsS = Math.max(0, ...sheepEndAbsSActive, ...ufoLeaveAbsS);
  const travelSCells = (from: [number, number], to: [number, number]) => {
    const dist = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return Math.min(
      UFO_MOVE_MAX_S,
      Math.max(UFO_MOVE_MIN_S, dist * UFO_CELL_TIME),
    );
  };
  let tCursor = allSheepDoneAbsS;
  let prevCell: [number, number] = funnelPositionsEarly[sheepCount - 1] ??
    funnelPositionsEarly[0] ?? [0, 0];
  for (let k = 0; k < activeSheepIndices.length; k++) {
    const sheepIndex = activeSheepIndices[k];
    const nextCell = pickupCells[k];
    tCursor += travelSCells(prevCell, nextCell);
    pickupArriveBySheep[sheepIndex] = tCursor;
    tCursor += PICKUP_WAIT_S;
    tCursor += PICKUP_LIGHT_S + PICKUP_FADE_S;
    prevCell = nextCell;
  }
  const pickupEndAbsS = tCursor;

  // ---- 페인트 파동: 회수 후 그리드 중앙으로 이동 → 파동 쏘면 거리순으로 칠해짐 → 퇴장 ----
  const { maxX, maxY } = ctx;
  const paintCenterCol = Math.floor(maxX / 2);
  const paintCenterRow = Math.floor(maxY / 2);
  const PAINT_WAVE_SPEED_S = 0.1;
  const maxDist =
    Math.max(paintCenterCol, maxX - paintCenterCol) +
    Math.max(paintCenterRow, maxY - paintCenterRow);
  const paintSweepStartAbsS = pickupEndAbsS;
  const paintSweepDuration = maxDist * PAINT_WAVE_SPEED_S;
  const sweepPositions: [number, number][] = [[paintCenterCol, paintCenterRow]];
  const sweepArriveAbsS: number[] = [paintSweepStartAbsS];

  const timelineOffset = timing.ufoEntryS;
  const maxTotalTimeWithEntryExit =
    Math.max(timelineOffset + maxTotalTime, pickupEndAbsS) +
    paintSweepDuration +
    timing.ufoExitS;
  const ufoArriveAbsSOffset = ufoArriveAbsS.map(
    (t: number) => t + timelineOffset,
  );
  const spawnAbsSOffset = visualSpawnAbsS.map((s) => s + timelineOffset);
  const readyAbsSOffset = readyAbsS.map((r) => r + timelineOffset);
  const moveStartAbsSOffset = visualMoveStartAbsS.map(
    (m) => m + timelineOffset,
  );
  const ufoLeaveAbsSOffset = ufoLeaveAbsS.map((u) => u + timelineOffset);
  const sweepArriveAbsSOffset = sweepArriveAbsS.map((t) => t + timelineOffset);
  const paintSweepStartAbsSOffset = paintSweepStartAbsS + timelineOffset;

  if (process.env?.DEBUG_TIMING === "1") {
    const sample = Math.min(5, sheepCount);
    for (let i = 0; i < sample; i++) {
      const timeline = positionsHistory[i] ?? [];
      const target = sheepTargetsWithEmpty[i];
      const spawnPos = funnelPositionsEarly[i];
      if (target && spawnPos) {
        console.log(
          `[spawn] sheep=${i} spawnCell=${spawnPos[0]},${spawnPos[1]} targetGrass=${target.grass.x},${target.grass.y} neighbor=${target.emptyNeighbor.x},${target.emptyNeighbor.y}`,
        );
      }
      console.log(
        `[timing] sheep=${i} spawn=${(visualSpawnAbsS[i] ?? 0).toFixed(2)} ready=${readyAbsS[i].toFixed(2)} moveStart=${(visualMoveStartAbsS[i] ?? 0).toFixed(2)} len=${timeline.length}`,
      );
    }
    console.log(
      `[timing] maxTotalTime=${maxTotalTime.toFixed(2)} MOVE_START_S=${timing.moveStartS.toFixed(2)}`,
    );
  }
  if (process.env?.DEBUG_DROP === "1") {
    console.log("\n--- [DEBUG_DROP] 드롭 위치·타이밍 검증 ---");
    for (let i = 0; i < sheepCount; i++) {
      const t = sheepTargetsWithEmpty[i];
      const path = paths[i] ?? [];
      const firstPos = positionsHistory[i]?.[0];
      const dropKey = firstPos ? `${firstPos[0]},${firstPos[1]}` : "none";
      const countAtDrop =
        dropKey !== "none" ? (initialCountByKey.get(dropKey) ?? -1) : -1;
      const isGrass = countAtDrop > 0;
      console.log(
        `[drop] sheep=${i} path[0]=${path[0] ? `${path[0][0]},${path[0][1]}` : "none"} ` +
          `emptyNeighbor=${t ? `${t.emptyNeighbor.x},${t.emptyNeighbor.y}` : "n/a"} ` +
          `simFirstPos=${dropKey} count=${countAtDrop} ${isGrass ? "⚠️잔디(버그)" : "✓빈칸"}`,
      );
      console.log(
        `[ufo] sheep=${i} spawn=${(visualSpawnAbsS[i] ?? 0).toFixed(2)}s ready=${readyAbsS[i].toFixed(2)}s ` +
          `moveStart=${(visualMoveStartAbsS[i] ?? 0).toFixed(2)}s firstGrass=${sheepFirstGrassArrivalS[i] === Infinity ? "∞" : sheepFirstGrassArrivalS[i].toFixed(2)}s ufoLeave=${ufoLeaveAbsS[i].toFixed(2)}s`,
      );
    }
    console.log("---\n");
  }
  if (process.env?.DEBUG_SPEC === "1") {
    const i = 0;
    console.log(
      "\n--- [DEBUG_SPEC] UFO_SHEEP_SPEC 타임라인 (sheep 0 기준) ---",
    );
    console.log(
      `진입 끝(우주선 정지): ${timelineOffset.toFixed(2)}s | ` +
        `불빛 켜짐 완료: ${(spawnAbsSOffset[i] + 0.12).toFixed(2)}s | ` +
        `양 내림 완료(보임): ${readyAbsSOffset[i].toFixed(2)}s`,
    );
    console.log(
      `양 움직임 시작: ${moveStartAbsSOffset[i].toFixed(2)}s | ` +
        `불빛 꺼짐 완료: ${(moveStartAbsSOffset[i] + LIGHT_FADE_OUT_S).toFixed(2)}s | ` +
        `양 첫 잔디 도착: ${sheepFirstGrassArrivalS[i] === Infinity ? "∞" : (sheepFirstGrassArrivalS[i] + timelineOffset).toFixed(2)}s`,
    );
    console.log(
      `UFO 다음 위치 출발: ${ufoLeaveAbsSOffset[i].toFixed(2)}s (불빛끔 & 양 첫잔디 도착 중 늦은 시점)`,
    );
    console.log(
      `전체 길이: ${maxTotalTimeWithEntryExit.toFixed(2)}s (진입 ${timing.ufoEntryS}s + 본편 + 퇴장 ${timing.ufoExitS}s)`,
    );
    console.log("---\n");
  }

  const firstArrivals = new Map<
    string,
    { arrivalTime: number; level: number }
  >();
  for (const [k, v] of targetCellArrivals) {
    if (v.length > 0) {
      firstArrivals.set(k, {
        arrivalTime: v[0].arrivalTime,
        level: v[0].level,
      });
    }
  }

  const pickupArriveAbsSOffsetForUfo = activeSheepIndices.map((i) => {
    const t = pickupArriveBySheep[i];
    return t == null ? 0 : t + timelineOffset;
  });
  const pickupArriveAbsSOffset: (number | null)[] = pickupArriveBySheep.map(
    (t) => (t == null ? null : t + timelineOffset),
  );
  const assignedIndices = Array.from(
    { length: sheepCount },
    (_, i) => i,
  ).filter(
    (i) =>
      sheepTargetsWithEmpty[i] != null &&
      (positionsHistory[i]?.length ?? 0) > 0,
  );

  return {
    timelineOffset,
    maxTotalTimeWithEntryExit,
    firstArrivals,
    ufoArriveAbsSOffset,
    spawnAbsSOffset,
    readyAbsSOffset,
    moveStartAbsSOffset,
    ufoLeaveAbsSOffset,
    pickupCells,
    pickupArriveBySheep,
    pickupArriveAbsSOffsetForUfo,
    pickupArriveAbsSOffset,
    sweepPositions,
    sweepArriveAbsSOffset,
    paintSweepStartAbsSOffset,
    paintSweepDuration,
    paintWaveSpeedS: PAINT_WAVE_SPEED_S,
    paintCenterCol,
    paintCenterRow,
    activeSheepIndices,
    assignedIndices,
  };
}
