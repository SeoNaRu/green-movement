import type { GridCell } from "../../grid/mapGrid.js";
import {
  CELL_SIZE,
  GAP,
  BORDER_RADIUS,
  COLORS,
  GRASS_FADE_DURATION,
  GRASS_FADE_START_DELAY,
  GRASS_STEP_TIMES_S,
  SHEEP_CELL_TIME,
  SHEEP_CONTENT,
  SHEEP_VIEWBOX_CX,
  SHEEP_VIEWBOX_CY,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  SHEEP_BODY_SHIFT_PX,
  UFO_CELL_TIME,
  UFO_MOVE_MIN_S,
  UFO_MOVE_MAX_S,
  UFO_TILT_DEG,
  UFO_VIEWBOX,
  UFO_WIDTH_PX,
  UFO_CONTENT,
  UFO_BEAM_DELAY_S,
} from "../constants.js";
import { getCellCenterPx } from "../gridLayout.js";
import { getContributionLevel, getColor } from "../contribution.js";

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

/** UFO 리플: ring 1=2x2중앙, ring n(n>=2)= (2n)x(2n) 테두리. 그리드 밖은 add에서 걸러짐. */
function getRippleRingCells(
  cx: number,
  cy: number,
  ring: number,
  maxX: number,
  maxY: number,
): [number, number][] {
  const out: [number, number][] = [];
  const add = (c: number, r: number) => {
    if (c >= 0 && c <= maxX && r >= 0 && r <= maxY) out.push([c, r]);
  };
  if (ring === 1) {
    add(cx, cy);
    add(cx + 1, cy);
    add(cx, cy + 1);
    add(cx + 1, cy + 1);
    return out;
  }
  const n = ring;
  for (let c = cx - n + 1; c <= cx + n; c++) {
    add(c, cy - n + 1);
    add(c, cy + n);
  }
  for (let r = cy - n + 1; r <= cy + n; r++) {
    add(cx - n + 1, r);
    add(cx + n, r);
  }
  return out;
}

export function buildUfoLayer(params: {
  funnelPositionsEarly: [number, number][];
  spawnAbsS: number[];
  arriveAbsS: number[];
  maxTotalTime: number;
  gridLeftX: number;
  gridTopY: number;
  beamDelayS: number;
  lightRampS: number;
  lightFadeOutS: number;
  moveStartAbsS: number[];
  ufoLeaveAbsS: number[];
  readyAbsS: number[];
  ufoEntryS: number;
  ufoExitS: number;
  maxX: number;
  maxY: number;
  pickupCells?: [number, number][];
  pickupArriveAbsS?: number[];
  pickupWaitS?: number;
  pickupLightS?: number;
  sweepPositions?: [number, number][];
  sweepArriveAbsS?: number[];
  paintSweepDuration?: number;
  paintCenterCol?: number;
  paintCenterRow?: number;
}): {
  ufoKeyframesStr: string;
  ufoLightKeyframesStr: string;
  ufoGroupStr: string;
  ufoRippleKeyframesStr: string;
  ufoRippleGroupStr: string;
} {
  const {
    funnelPositionsEarly,
    spawnAbsS,
    arriveAbsS,
    maxTotalTime,
    gridLeftX,
    gridTopY,
    beamDelayS,
    lightRampS,
    lightFadeOutS,
    moveStartAbsS,
    ufoLeaveAbsS,
    readyAbsS,
    ufoEntryS,
    ufoExitS,
    maxX,
    maxY,
    pickupCells,
    pickupArriveAbsS,
    pickupWaitS,
    pickupLightS,
    sweepPositions,
    sweepArriveAbsS,
    paintSweepDuration = 0,
    paintCenterCol = 0,
    paintCenterRow = 0,
  } = params;

  const pickupCellsArr = pickupCells ?? [];
  const pickupArriveArr = pickupArriveAbsS ?? [];
  const sweepPositionsArr = sweepPositions ?? [];
  const sweepArriveArr = sweepArriveAbsS ?? [];
  const pickupWait = pickupWaitS ?? 0.35;
  const pickupLight = pickupLightS ?? 0.22;

  const ufoCenter = UFO_WIDTH_PX / 2;
  const dirAngle = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
  ) => {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 0;
    return (Math.atan2(dy, dx) * 180) / Math.PI - 90;
  };

  const PERSPECTIVE_PX = 800;
  const bankForDelta = (
    fromPx: { x: number; y: number },
    toPx: { x: number; y: number },
  ): string => {
    const dx = toPx.x - fromPx.x;
    const dy = toPx.y - fromPx.y;
    let rx = 0;
    let ry = 0;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // 좌우 이동 → 좌/우로 기울기 (Y축 회전)
      ry = dx > 0 ? -UFO_BANK_DEG : UFO_BANK_DEG;
    } else {
      // 상하 이동 → 앞/뒤로 기울기 (X축 회전)
      rx = dy > 0 ? UFO_BANK_DEG : -UFO_BANK_DEG;
    }

    return `perspective(${PERSPECTIVE_PX}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  };

  const UFO_BANK_DEG = UFO_TILT_DEG;
  const ufoMoveKeyframePcts: string[] = [];
  const ufoRotKeyframePcts: string[] = [];
  const ufoBankKeyframePcts: string[] = [];
  if (funnelPositionsEarly.length > 0) {
    const pos0 = getCellCenterPx(
      gridLeftX,
      gridTopY,
      funnelPositionsEarly[0][0],
      funnelPositionsEarly[0][1],
    );
    const x0 = pos0.x - UFO_WIDTH_PX / 2;
    const y0 = pos0.y - UFO_WIDTH_PX / 2;
    const entryY = y0 - 60;
    const entryAngle = 0;
    ufoMoveKeyframePcts.push(
      `0% { transform: translate(${x0}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`0% { transform: rotate(${entryAngle}deg); }`);
    const arrive0 = arriveAbsS[0] ?? ufoEntryS;
    const pctArrive0 = maxTotalTime > 0 ? (arrive0 * 100) / maxTotalTime : 0;
    const angle0 =
      funnelPositionsEarly.length > 1
        ? dirAngle(
            { x: x0 + ufoCenter, y: entryY + ufoCenter },
            { x: pos0.x, y: pos0.y },
          )
        : 0;
    ufoMoveKeyframePcts.push(
      `${pctArrive0.toFixed(4)}% { transform: translate(${x0}px, ${y0}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctArrive0.toFixed(4)}% { transform: rotate(${angle0}deg); }`,
    );
    const stayEnd0 = ufoLeaveAbsS[0] ?? 0;
    const pctStayEnd0 = maxTotalTime > 0 ? (stayEnd0 * 100) / maxTotalTime : 0;
    if (funnelPositionsEarly.length > 1 && pctStayEnd0 < 99.99) {
      ufoMoveKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: translate(${x0}px, ${y0}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: rotate(${angle0}deg); }`,
      );
      const nextPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[1][0],
        funnelPositionsEarly[1][1],
      );
      const arrive1 = arriveAbsS[1] ?? stayEnd0;
      const pctArrive1 = maxTotalTime > 0 ? (arrive1 * 100) / maxTotalTime : 0;
      const angle1 = dirAngle(pos0, nextPos);
      const bankTf1 = bankForDelta(pos0, nextPos);
      const startTiltPct = Math.min(
        pctArrive1 - 0.0001,
        pctStayEnd0 + 0.15 * (pctArrive1 - pctStayEnd0),
      );
      ufoRotKeyframePcts.push(
        `${startTiltPct.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      const midPct = (pctStayEnd0 + pctArrive1) / 2;
      const endTiltPct = Math.min(
        pctArrive1 - 0.0001,
        pctStayEnd0 + 0.85 * (pctArrive1 - pctStayEnd0),
      );
      const nextX = nextPos.x - UFO_WIDTH_PX / 2;
      const nextY = nextPos.y - UFO_WIDTH_PX / 2;
      const midX = (x0 + nextX) / 2;
      const midY = (y0 + nextY) / 2;
      ufoMoveKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: translate(${midX}px, ${midY}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      ufoMoveKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: translate(${nextPos.x - UFO_WIDTH_PX / 2}px, ${nextPos.y - UFO_WIDTH_PX / 2}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: rotate(${angle1}deg); }`,
      );
      // bank: 출발 직전 0 → 이동 중간 bankTf1 → 도착 직전/직후 0
      const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
      ufoBankKeyframePcts.push(
        `${pctStayEnd0.toFixed(4)}% { transform: ${bankReset}; }`,
      );
      ufoBankKeyframePcts.push(
        `${startTiltPct.toFixed(4)}% { transform: ${bankTf1}; }`,
      );
      ufoBankKeyframePcts.push(
        `${midPct.toFixed(4)}% { transform: ${bankTf1}; }`,
      );
      ufoBankKeyframePcts.push(
        `${endTiltPct.toFixed(4)}% { transform: ${bankReset}; }`,
      );
      ufoBankKeyframePcts.push(
        `${pctArrive1.toFixed(4)}% { transform: ${bankReset}; }`,
      );
    }
    for (let i = 1; i < funnelPositionsEarly.length - 1; i++) {
      const stayEndI = ufoLeaveAbsS[i] ?? 0;
      const pctStayEndI =
        maxTotalTime > 0 ? (stayEndI * 100) / maxTotalTime : 0;
      const currPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[i][0],
        funnelPositionsEarly[i][1],
      );
      const cx = currPos.x - UFO_WIDTH_PX / 2;
      const cy = currPos.y - UFO_WIDTH_PX / 2;
      const angleI = dirAngle(
        getCellCenterPx(
          gridLeftX,
          gridTopY,
          funnelPositionsEarly[i - 1][0],
          funnelPositionsEarly[i - 1][1],
        ),
        currPos,
      );
      ufoMoveKeyframePcts.push(
        `${pctStayEndI.toFixed(4)}% { transform: translate(${cx}px, ${cy}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${pctStayEndI.toFixed(4)}% { transform: rotate(${angleI}deg); }`,
      );
      const nextPos = getCellCenterPx(
        gridLeftX,
        gridTopY,
        funnelPositionsEarly[i + 1][0],
        funnelPositionsEarly[i + 1][1],
      );
      const arriveNext = arriveAbsS[i + 1] ?? stayEndI;
      const pctArriveNext =
        maxTotalTime > 0 ? (arriveNext * 100) / maxTotalTime : 0;
      const angleNext = dirAngle(currPos, nextPos);
      if (pctArriveNext <= 100) {
        const bankTf = bankForDelta(currPos, nextPos);
        const startTiltPct = Math.min(
          pctArriveNext - 0.0001,
          pctStayEndI + 0.15 * (pctArriveNext - pctStayEndI),
        );
        ufoRotKeyframePcts.push(
          `${startTiltPct.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        const midPct = (pctStayEndI + pctArriveNext) / 2;
        const endTiltPct = Math.min(
          pctArriveNext - 0.0001,
          pctStayEndI + 0.85 * (pctArriveNext - pctStayEndI),
        );
        const midX = cx + (nextPos.x - UFO_WIDTH_PX / 2 - cx) * 0.5;
        const midY = cy + (nextPos.y - UFO_WIDTH_PX / 2 - cy) * 0.5;
        ufoMoveKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: translate(${midX}px, ${midY}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        ufoMoveKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: translate(${nextPos.x - UFO_WIDTH_PX / 2}px, ${nextPos.y - UFO_WIDTH_PX / 2}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: rotate(${angleNext}deg); }`,
        );
        // bank: 출발 직전 0 → 이동 중간 bankTf → 도착 직전/직후 0
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctStayEndI.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${startTiltPct.toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${midPct.toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${endTiltPct.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${pctArriveNext.toFixed(4)}% { transform: ${bankReset}; }`,
        );
      }
    }
    const lastIdx = funnelPositionsEarly.length - 1;
    const lastPos = funnelPositionsEarly[lastIdx];
    const lastPosPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      lastPos[0],
      lastPos[1],
    );
    const lastStayEnd = ufoLeaveAbsS[lastIdx] ?? 0;
    const pctLastStay =
      maxTotalTime > 0 ? (lastStayEnd * 100) / maxTotalTime : 0;
    const lastSegAngle =
      lastIdx >= 1
        ? dirAngle(
            getCellCenterPx(
              gridLeftX,
              gridTopY,
              funnelPositionsEarly[lastIdx - 1][0],
              funnelPositionsEarly[lastIdx - 1][1],
            ),
            lastPosPx,
          )
        : 0;
    const lastTx = lastPosPx.x - UFO_WIDTH_PX / 2;
    const lastTy = lastPosPx.y - UFO_WIDTH_PX / 2;
    ufoMoveKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: translate(${lastTx}px, ${lastTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${pctLastStay.toFixed(4)}% { transform: rotate(${lastSegAngle}deg); }`,
    );
    // ---- pickup 이동: 마지막 드롭 위치에서 각 pickupCells로 이동 ----
    if (
      pickupCellsArr.length > 0 &&
      pickupArriveArr.length === pickupCellsArr.length
    ) {
      const lastPosCell = funnelPositionsEarly[lastIdx];
      let prevPx = getCellCenterPx(
        gridLeftX,
        gridTopY,
        lastPosCell[0],
        lastPosCell[1],
      );

      for (let k = 0; k < pickupCellsArr.length; k++) {
        const cell = pickupCellsArr[k];
        const arriveT = pickupArriveArr[k];

        const posPx = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const tx = posPx.x - UFO_WIDTH_PX / 2;
        const ty = posPx.y - UFO_WIDTH_PX / 2;
        const pctArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;

        // “도착” 위치 고정
        ufoMoveKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );

        // 회수 방향 각도(이전 위치 -> 현재 위치)
        const angle = dirAngle(prevPx, posPx);
        ufoRotKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        // 회수 중 잠깐 머무는 구간 (빛/회수)
        const holdEndT = arriveT + pickupWait + pickupLight;
        const pctHoldEnd =
          maxTotalTime > 0 ? (holdEndT * 100) / maxTotalTime : 0;
        ufoMoveKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );

        // pickup 이동에도 bank 적용: 도착 시점 0 → 이동/홀드 중 bank → 홀드 끝에 0
        const bankTfPickup = bankForDelta(prevPx, posPx);
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        const midPickupPct = (pctArrive + pctHoldEnd) / 2;
        ufoBankKeyframePcts.push(
          `${midPickupPct.toFixed(4)}% { transform: ${bankTfPickup}; }`,
        );
        ufoBankKeyframePcts.push(
          `${pctHoldEnd.toFixed(4)}% { transform: ${bankReset}; }`,
        );

        prevPx = posPx;
      }
    }

    // ---- 페인트 스윕: 왼쪽→오른쪽 쭉 지나간 뒤 퇴장 ----
    let exitFromTx = lastTx;
    let exitFromTy = lastTy;
    let exitFromAngle = lastSegAngle;
    if (
      sweepPositionsArr.length > 0 &&
      sweepArriveArr.length === sweepPositionsArr.length
    ) {
      let prevPxSweep =
        pickupCellsArr.length > 0
          ? getCellCenterPx(
              gridLeftX,
              gridTopY,
              pickupCellsArr[pickupCellsArr.length - 1][0],
              pickupCellsArr[pickupCellsArr.length - 1][1],
            )
          : getCellCenterPx(
              gridLeftX,
              gridTopY,
              funnelPositionsEarly[lastIdx][0],
              funnelPositionsEarly[lastIdx][1],
            );
      const firstSweepT = sweepArriveArr[0];
      const SWEEP_APPROACH_S = 0.25;
      const approachT = Math.max(0, firstSweepT - SWEEP_APPROACH_S);
      const approachPct =
        maxTotalTime > 0 ? (approachT * 100) / maxTotalTime : 0;
      const approachTx = prevPxSweep.x - UFO_WIDTH_PX / 2;
      const approachTy = prevPxSweep.y - UFO_WIDTH_PX / 2;
      const firstSweepPx = getCellCenterPx(
        gridLeftX,
        gridTopY,
        sweepPositionsArr[0][0],
        sweepPositionsArr[0][1],
      );
      const approachAngle = dirAngle(prevPxSweep, firstSweepPx);
      ufoMoveKeyframePcts.push(
        `${approachPct.toFixed(4)}% { transform: translate(${approachTx}px, ${approachTy}px); }`,
      );
      ufoRotKeyframePcts.push(
        `${approachPct.toFixed(4)}% { transform: rotate(${approachAngle}deg); }`,
      );
      for (let s = 0; s < sweepPositionsArr.length; s++) {
        const cell = sweepPositionsArr[s];
        const arriveT = sweepArriveArr[s];
        const posPx = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const tx = posPx.x - UFO_WIDTH_PX / 2;
        const ty = posPx.y - UFO_WIDTH_PX / 2;
        const pctArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;
        const angle = dirAngle(prevPxSweep, posPx);
        ufoMoveKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: translate(${tx}px, ${ty}px); }`,
        );
        ufoRotKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: rotate(${angle}deg); }`,
        );
        const bankTf = bankForDelta(prevPxSweep, posPx);
        const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
        ufoBankKeyframePcts.push(
          `${pctArrive.toFixed(4)}% { transform: ${bankReset}; }`,
        );
        ufoBankKeyframePcts.push(
          `${(pctArrive + 0.01).toFixed(4)}% { transform: ${bankTf}; }`,
        );
        ufoBankKeyframePcts.push(
          `${(pctArrive + 0.02).toFixed(4)}% { transform: ${bankReset}; }`,
        );
        exitFromTx = tx;
        exitFromTy = ty;
        exitFromAngle = angle;
        prevPxSweep = posPx;
      }
    }

    const exitStartPct = Math.min(
      99.5,
      ((maxTotalTime - ufoExitS) * 100) / maxTotalTime,
    );
    ufoMoveKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: translate(${exitFromTx}px, ${exitFromTy}px); }`,
    );
    ufoRotKeyframePcts.push(
      `${exitStartPct.toFixed(4)}% { transform: rotate(${exitFromAngle}deg); }`,
    );
    ufoMoveKeyframePcts.push(
      `100% { transform: translate(${exitFromTx}px, ${entryY}px); }`,
    );
    ufoRotKeyframePcts.push(`100% { transform: rotate(${entryAngle}deg); }`);
  }
  const firstPos = funnelPositionsEarly[0];
  const firstPosPx = getCellCenterPx(
    gridLeftX,
    gridTopY,
    firstPos[0],
    firstPos[1],
  );
  const entryY = firstPosPx.y - UFO_WIDTH_PX / 2 - 60;
  // bank가 있다면 글로벌 0% / 100% 안전 프레임 추가
  if (ufoBankKeyframePcts.length > 0) {
    const bankReset = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg)`;
    ufoBankKeyframePcts.unshift(`0% { transform: ${bankReset}; }`);
    ufoBankKeyframePcts.push(`100% { transform: ${bankReset}; }`);
  }

  const hasUfo = ufoMoveKeyframePcts.length > 0;
  const ufoKeyframesStr = hasUfo
    ? `
  @keyframes ufo-move {
    ${ufoMoveKeyframePcts.join("\n    ")}
  }
  @keyframes ufo-rot {
    ${ufoRotKeyframePcts.join("\n    ")}
  }`
    : "";

  const lightKeyframeEntries: { pct: number; opacity: number }[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const tArrive = arriveAbsS[i] ?? spawnAbsS[i] ?? 0;
    const tBeamOn = tArrive + beamDelayS;
    const tBeamFull = tBeamOn + lightRampS;

    const pctOn = maxTotalTime > 0 ? (tBeamOn * 100) / maxTotalTime : 0;
    const pctFull = maxTotalTime > 0 ? (tBeamFull * 100) / maxTotalTime : 0;

    const moveStart = moveStartAbsS[i] ?? tBeamFull;
    const pctMoveStart =
      maxTotalTime > 0 ? (moveStart * 100) / maxTotalTime : 0;
    const lightOffComplete = moveStart + lightFadeOutS;
    const pctOff =
      maxTotalTime > 0 ? (lightOffComplete * 100) / maxTotalTime : 0;
    lightKeyframeEntries.push({ pct: pctOn, opacity: 0 });
    lightKeyframeEntries.push({ pct: pctFull, opacity: 0.1 });
    lightKeyframeEntries.push({ pct: pctMoveStart, opacity: 0.3 });
    lightKeyframeEntries.push({ pct: pctOff, opacity: 0 });
  }

  // ---- pickup light: 회수 때도 빛을 켠다 (UFO 위치와 동기화) ----
  if (
    pickupCellsArr.length > 0 &&
    pickupArriveArr.length === pickupCellsArr.length
  ) {
    for (let k = 0; k < pickupCellsArr.length; k++) {
      const arriveT = pickupArriveArr[k] ?? 0;

      const tOn = arriveT + pickupWait;
      const tOff = tOn + pickupLight;

      const pArrive = maxTotalTime > 0 ? (arriveT * 100) / maxTotalTime : 0;
      const pOn = maxTotalTime > 0 ? (tOn * 100) / maxTotalTime : 0;
      const pOff = maxTotalTime > 0 ? (tOff * 100) / maxTotalTime : 0;

      lightKeyframeEntries.push({ pct: pArrive, opacity: 0 });
      lightKeyframeEntries.push({ pct: pOn, opacity: 0.12 });
      lightKeyframeEntries.push({ pct: pOff, opacity: 0 });
    }
  }
  lightKeyframeEntries.push({ pct: 0, opacity: 0 }, { pct: 100, opacity: 0 });
  lightKeyframeEntries.sort((a, b) => a.pct - b.pct);
  const deduped: { pct: number; opacity: number }[] = [];
  for (const e of lightKeyframeEntries) {
    if (deduped.length === 0 || deduped[deduped.length - 1].pct !== e.pct)
      deduped.push(e);
  }
  const ufoLightKeyframesStr =
    funnelPositionsEarly.length > 0 && deduped.length > 0
      ? `
  @keyframes ufo-light {
    ${deduped.map((e) => `${e.pct.toFixed(4)}% { opacity: ${e.opacity}; }`).join("\n    ")}
  }`
      : "";

  const glowR = UFO_WIDTH_PX * 0.7;
  const ufoGroupStr = hasUfo
    ? `<g class="ufo-move" style="transform: translate(${firstPosPx.x - UFO_WIDTH_PX / 2}px, ${entryY}px); animation: ufo-move ${maxTotalTime}s linear 0s 1 both;">
        <g class="ufo-rot" style="transform-box: fill-box; transform-origin: center; animation: ufo-rot ${maxTotalTime}s linear 0s 1 both;">
          <svg width="${UFO_WIDTH_PX}" height="${UFO_WIDTH_PX}" viewBox="${UFO_VIEWBOX}" x="0" y="0">${UFO_CONTENT}</svg>
          <circle cx="${ufoCenter}" cy="${ufoCenter}" r="${glowR}" fill="#79c0ff" style="opacity: 0; animation: ufo-light ${maxTotalTime}s linear 0s 1 both; pointer-events: none;"/>
        </g>
      </g>`
    : "";

  // ---- 퍼져나가는 파동(리플): 드롭 + 회수 + 중앙(페인트). ring 1→2→3, 중앙만 ring 4=그리드 끝 ----
  const RIPPLE_STEP_S = 0.06;
  const RIPPLE_OPACITY_PEAK = 0.14;
  const RIPPLE_OPACITY_EDGE = 0.06;
  const RIPPLE_RAMP_S = 0.03;
  const RIPPLE_CYCLE_S = 0.7;
  type RippleStop = {
    cx: number;
    cy: number;
    tBeamOn: number;
    tLeave: number;
    fullGridWave?: boolean;
  };
  const rippleStops: RippleStop[] = [];
  for (let i = 0; i < funnelPositionsEarly.length; i++) {
    const [cx, cy] = funnelPositionsEarly[i];
    const tBeamOn = (arriveAbsS[i] ?? spawnAbsS[i] ?? 0) + beamDelayS;
    const tLeave = ufoLeaveAbsS[i] ?? tBeamOn + 1;
    rippleStops.push({ cx, cy, tBeamOn, tLeave });
  }
  if (
    pickupCellsArr.length > 0 &&
    pickupArriveArr.length === pickupCellsArr.length
  ) {
    for (let k = 0; k < pickupCellsArr.length; k++) {
      const [cx, cy] = pickupCellsArr[k];
      const tBeamOn = (pickupArriveArr[k] ?? 0) + pickupWait;
      const tLeave = tBeamOn + pickupLight;
      rippleStops.push({ cx, cy, tBeamOn, tLeave });
    }
  }
  if (
    sweepPositionsArr.length > 0 &&
    sweepArriveArr.length > 0 &&
    paintSweepDuration > 0
  ) {
    const [cx, cy] = sweepPositionsArr[0];
    const tBeamOn = sweepArriveArr[0];
    const tLeave = tBeamOn + paintSweepDuration;
    rippleStops.push({ cx, cy, tBeamOn, tLeave, fullGridWave: true });
  }
  const rippleKeyframes: string[] = [];
  const rippleRects: string[] = [];
  if (hasUfo && rippleStops.length > 0 && maxTotalTime > 0) {
    const pctRamp = (RIPPLE_RAMP_S / maxTotalTime) * 100;
    for (let idx = 0; idx < rippleStops.length; idx++) {
      const { cx, cy, tBeamOn, tLeave, fullGridWave } = rippleStops[idx];
      const stayDuration = Math.max(0, tLeave - tBeamOn);
      const numBursts = fullGridWave
        ? 1
        : Math.max(1, Math.floor(stayDuration / RIPPLE_CYCLE_S));
      const maxRing = fullGridWave
        ? Math.max(cx + 1, maxX - cx, cy + 1, maxY - cy)
        : 3;
      const rippleStepS = fullGridWave
        ? paintSweepDuration / Math.max(1, maxRing - 1)
        : RIPPLE_STEP_S;
      for (let ring = 1; ring <= maxRing; ring++) {
        const entries: { pct: number; opacity: number }[] = [];
        for (let b = 0; b < numBursts; b++) {
          const tOn = tBeamOn + b * RIPPLE_CYCLE_S + (ring - 1) * rippleStepS;
          const tOff = tOn + rippleStepS;
          const pctOn = (tOn / maxTotalTime) * 100;
          const pctOff = (tOff / maxTotalTime) * 100;
          const pIn = Math.max(0, pctOn - pctRamp);
          const pOut = Math.min(100, pctOff + pctRamp);
          const mid = (pctOn + pctOff) / 2;
          entries.push({ pct: pIn, opacity: 0 });
          entries.push({ pct: pctOn, opacity: RIPPLE_OPACITY_EDGE });
          entries.push({ pct: mid, opacity: RIPPLE_OPACITY_PEAK });
          entries.push({ pct: pctOff, opacity: RIPPLE_OPACITY_EDGE });
          entries.push({ pct: pOut, opacity: 0 });
        }
        entries.sort((a, b) => a.pct - b.pct);
        const deduped: { pct: number; opacity: number }[] = [];
        for (const e of entries) {
          if (
            deduped.length > 0 &&
            deduped[deduped.length - 1].pct >= e.pct - 0.0001
          )
            deduped[deduped.length - 1] = e;
          else deduped.push(e);
        }
        const name = `ufo-ripple-${idx}-${ring}`;
        rippleKeyframes.push(`
  @keyframes ${name} {
    0% { opacity: 0; }
    ${deduped.map((e) => `${e.pct.toFixed(4)}% { opacity: ${e.opacity}; }`).join("\n    ")}
    100% { opacity: 0; }
  }`);
        const cells = getRippleRingCells(cx, cy, ring, maxX, maxY);
        for (const [c, row] of cells) {
          const px = gridLeftX + c * (CELL_SIZE + GAP);
          const py = gridTopY + row * (CELL_SIZE + GAP);
          rippleRects.push(
            `<rect x="${px}" y="${py}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="#a8e6cf" style="opacity:0; animation: ${name} ${maxTotalTime}s linear 0s 1 both; pointer-events: none;"/>`,
          );
        }
      }
    }
  }
  const ufoRippleKeyframesStr = rippleKeyframes.join("");
  const ufoRippleGroupStr =
    rippleRects.length > 0
      ? `<g class="ufo-ripple" aria-hidden="true">${rippleRects.join("")}</g>`
      : "";

  return {
    ufoKeyframesStr,
    ufoLightKeyframesStr,
    ufoGroupStr,
    ufoRippleKeyframesStr,
    ufoRippleGroupStr,
  };
}

export function buildSheepLayer(params: {
  positionsHistory: [number, number][][];
  assignedIndices: number[];
  spawnAbsS: number[];
  moveStartAbsS: number[];
  maxTotalTime: number;
  gridLeftX: number;
  gridTopY: number;
  dropStayS: number;
  lightRampS: number;
  sheepFadeS: number;
  dropDescentPx: number;
  moveStartS: number;
  pickupArriveAbsS?: (number | null)[];
  pickupFadeS?: number;
  pickupWaitS?: number;
  pickupLightS?: number;
}): { animationStyles: string; sheepGroups: string } {
  const {
    positionsHistory,
    assignedIndices,
    spawnAbsS,
    moveStartAbsS,
    maxTotalTime,
    gridLeftX,
    gridTopY,
    dropStayS,
    lightRampS,
    sheepFadeS,
    dropDescentPx,
    moveStartS,
    pickupArriveAbsS,
    pickupFadeS = 0.25,
    pickupWaitS,
    pickupLightS,
  } = params;

  const sheepScale = SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.5;
  /** 양을 셀 중심에서 몸쪽으로 밀어서, 입이 파티클(잔디 중심) 쪽에 오게 함 */
  const bodyShift = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      dx: -SHEEP_BODY_SHIFT_PX * Math.sin(rad),
      dy: SHEEP_BODY_SHIFT_PX * Math.cos(rad),
    };
  };

  const sheepAnimations = assignedIndices.map((si: number) => {
    const timeline = positionsHistory[si];
    if (!timeline || timeline.length === 0) {
      return { id: `sheep-${si}`, keyframes: "", animationCSS: "" };
    }
    const totalPoints = timeline.length;
    const totalMoves = Math.max(totalPoints - 1, 0);

    const frames: {
      t: number;
      x: number;
      y: number;
      angle: number;
    }[] = [];
    let lastAngle = 180;
    let time = 0;

    const angleOf = (dx: number, dy: number, fallback: number) => {
      if (dx > 0) return 90;
      if (dx < 0) return 270;
      if (dy > 0) return 180;
      if (dy < 0) return 0;
      return fallback;
    };

    {
      const cur = timeline[0];
      frames.push({ t: 0, x: cur[0], y: cur[1], angle: lastAngle });
    }

    for (let idx = 0; idx < totalMoves; idx++) {
      const cur = timeline[idx];
      const next = timeline[idx + 1];
      if (!next) break;

      const dx = next[0] - cur[0];
      const dy = next[1] - cur[1];

      const nextAngle = angleOf(dx, dy, lastAngle);
      const dirChanged = nextAngle !== lastAngle;
      const tickEnd = time + SHEEP_CELL_TIME;

      if (dx === 0 && dy === 0) {
        frames.push({
          t: tickEnd,
          x: cur[0],
          y: cur[1],
          angle: lastAngle,
        });
        time = tickEnd;
        continue;
      }

      if (dirChanged) {
        const rotateTime = time + SHEEP_CELL_TIME * 0.18;
        frames.push({
          t: rotateTime,
          x: cur[0],
          y: cur[1],
          angle: nextAngle,
        });
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      } else {
        frames.push({
          t: tickEnd,
          x: next[0],
          y: next[1],
          angle: nextAngle,
        });
      }

      lastAngle = nextAngle;
      time = tickEnd;
    }

    const timeOffset = spawnAbsS[si] ?? 0;
    const keyframeEntries: { pct: number; css: string }[] = [];
    const dropFrame = frames[0];
    const dropPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      dropFrame.x,
      dropFrame.y,
    );
    const dropOff = bodyShift(dropFrame.angle);
    const dropX = dropPx.x + dropOff.dx;
    const dropY = dropPx.y + dropOff.dy;
    const dropStartY = dropY - dropDescentPx;
    const offscreen = `transform: translate(-9999px, -9999px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0;`;
    const pctSpawn = maxTotalTime > 0 ? (timeOffset * 100) / maxTotalTime : 0;
    keyframeEntries.push({
      pct: 0,
      css: `0% { ${offscreen} }`,
    });
    if (pctSpawn > 0) {
      keyframeEntries.push({
        pct: Math.min(100, pctSpawn),
        css: `${Math.min(100, pctSpawn).toFixed(4)}% { transform: translate(${dropX}px, ${dropStartY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; }`,
      });
    } else {
      keyframeEntries.push({
        pct: 0,
        css: `0% { transform: translate(${dropX}px, ${dropStartY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; }`,
      });
    }
    const readyTime = timeOffset + (lightRampS + sheepFadeS);
    const moveStartTime = Math.max(moveStartAbsS[si] ?? 0, readyTime);
    const pctReady = maxTotalTime > 0 ? (readyTime * 100) / maxTotalTime : 0;
    const pctMoveStart =
      maxTotalTime > 0 ? (moveStartTime * 100) / maxTotalTime : 0;
    keyframeEntries.push({
      pct: Math.min(100, pctReady),
      css: `${Math.min(100, pctReady).toFixed(4)}% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
    });
    keyframeEntries.push({
      pct: Math.min(100, pctMoveStart),
      css: `${Math.min(100, pctMoveStart).toFixed(4)}% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
    });
    let firstMoveIdxHistory = -1;
    for (let ti = 1; ti < timeline.length; ti++) {
      if (
        timeline[ti][0] !== timeline[0][0] ||
        timeline[ti][1] !== timeline[0][1]
      ) {
        firstMoveIdxHistory = ti;
        break;
      }
    }
    const firstMoveT =
      firstMoveIdxHistory >= 0
        ? firstMoveIdxHistory * SHEEP_CELL_TIME
        : (frames[1]?.t ?? SHEEP_CELL_TIME);
    if (firstMoveIdxHistory >= 0) {
      for (let fi = 1; fi < frames.length; fi++) {
        const f = frames[fi];
        if (f.t < firstMoveT) continue;
        const { x, y } = getCellCenterPx(gridLeftX, gridTopY, f.x, f.y);
        const off = bodyShift(f.angle);
        const globalTime = moveStartTime + (f.t - firstMoveT);
        const percent =
          maxTotalTime > 0 ? (globalTime * 100) / maxTotalTime : 0;
        const pct = Math.min(99.9999, percent);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: translate(${x + off.dx}px, ${y + off.dy}px) rotate(${f.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; }`,
        });
      }
    }

    // --- pickup: UFO가 회수하러 "해당 양 위에 도착"한 뒤, 빛이 내려오고 나서 양이 사라진다 ---
    const pickupT = pickupArriveAbsS?.[si] ?? null;
    const pickupFade = pickupFadeS ?? 0.25;
    const pickupWait = pickupWaitS ?? 0.35;
    const pickupLight = pickupLightS ?? 0.22;

    if (pickupT != null && Number.isFinite(pickupT) && pickupT > 0) {
      // 빛이 내려온 "끝" 시점 이후에 fade 시작
      const fadeStartT = pickupT + pickupWait + pickupLight * 0.6;

      const p1 = maxTotalTime > 0 ? (fadeStartT * 100) / maxTotalTime : 0;
      const p2 =
        maxTotalTime > 0 ? ((fadeStartT + pickupFade) * 100) / maxTotalTime : 0;

      const a = Math.min(99.9998, Math.max(0, p1));
      const b = Math.min(99.9999, Math.max(a, p2));

      keyframeEntries.push({
        pct: a,
        css: `${a.toFixed(4)}% { opacity: 1; }`,
      });
      keyframeEntries.push({
        pct: b,
        css: `${b.toFixed(4)}% { opacity: 0; }`,
      });
    }

    const lastCell = timeline[timeline.length - 1];
    const lastFrame = frames[frames.length - 1];
    const lastPx = getCellCenterPx(
      gridLeftX,
      gridTopY,
      lastCell[0],
      lastCell[1],
    );
    const lastFrameAngle = lastFrame?.angle ?? 180;
    const lastOff = bodyShift(lastFrameAngle);
    const hasPickup =
      pickupT != null && Number.isFinite(pickupT) && pickupT > 0;
    keyframeEntries.push({
      pct: 100,
      css: `100% { transform: translate(${lastPx.x + lastOff.dx}px, ${lastPx.y + lastOff.dy}px) rotate(${lastFrameAngle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: ${hasPickup ? 0 : 1}; }`,
    });

    const delay = 0;
    const initialTransform = `transform: translate(-9999px, -9999px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; `;

    const sorted = keyframeEntries.slice().sort((a, b) => a.pct - b.pct);
    const deduped: string[] = [];
    let lastPct: number | null = null;
    for (const kf of sorted) {
      if (lastPct !== null && Math.abs(kf.pct - lastPct) < 1e-6) {
        deduped[deduped.length - 1] = kf.css;
      } else {
        deduped.push(kf.css);
        lastPct = kf.pct;
      }
    }

    return {
      id: `sheep-${si}`,
      keyframes: `@keyframes sheep-${si}-move {\n    ${deduped.join(
        "\n    ",
      )}\n  }`,
      animationCSS: `${initialTransform}animation: sheep-${si}-move ${maxTotalTime}s linear ${delay}s 1 both;`,
    };
  });

  const validSheepAnimations = sheepAnimations.filter(
    (a: { keyframes: string }) => a.keyframes.length > 0,
  );
  const animationStyles = validSheepAnimations
    .map((a: { keyframes: string }) => a.keyframes)
    .join("\n  ");

  let sheepGroups: string;
  if (validSheepAnimations.length > 0) {
    sheepGroups = validSheepAnimations
      .map(
        (a: { id: string; animationCSS: string }) =>
          `<g class="${a.id}" style="${a.animationCSS}">${SHEEP_CONTENT}</g>`,
      )
      .join("\n  ");
  } else {
    const pos = getCellCenterPx(gridLeftX, gridTopY, 0, 0);
    const off = bodyShift(180);
    const transform = `translate(${pos.x + off.dx}px, ${pos.y + off.dy}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
    sheepGroups = `<g class="sheep-fallback" transform="${transform}">${SHEEP_CONTENT}</g>`;
  }

  return { animationStyles, sheepGroups };
}
