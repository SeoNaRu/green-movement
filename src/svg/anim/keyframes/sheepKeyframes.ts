import {
  SHEEP_CELL_TIME,
  SHEEP_CONTENT,
  SHEEP_VIEWBOX_CX,
  SHEEP_VIEWBOX_CY,
  SHEEP_VIEWBOX_W,
  SHEEP_WIDTH_PX,
  SHEEP_BODY_SHIFT_PX,
  GRASS_STEP_TIMES_S,
  MOTION_TIME_SCALE,
} from "../../constants.js";
import { getCellCenterPx } from "../../layout/gridLayout.js";
import { buildSheepTagSvg } from "../../sheepTag.js";

const BITE_ANTICIPATION_S = 0.06;
const BITE_IMPACT_S = GRASS_STEP_TIMES_S[0];
const BITE_RELEASE_S = GRASS_STEP_TIMES_S[GRASS_STEP_TIMES_S.length - 1];

export function buildSheepLayer(params: {
  positionsHistory: [number, number][][];
  assignedIndices: number[];
  spawnAbsS: number[];
  moveStartAbsS: number[];
  biteAbsSBySheep: number[][];
  biteProgressBySheep: { atS: number; progress: number }[][];
  maxTotalTime: number;
  gridLeftX: number;
  gridTopY: number;
  lightRampS: number;
  sheepFadeS: number;
  pickupArriveAbsS?: (number | null)[];
  pickupFadeS?: number;
  pickupWaitS?: number;
  pickupLightS?: number;
  relocation?: {
    sheepIndex: number;
    historyIndex: number;
    from: [number, number];
    to: [number, number];
    pickupArriveAbsS: number;
    flightStartAbsS: number;
    dropArriveAbsS: number;
    releaseAbsS: number;
    operationDuration: number;
  } | null;
  turnovers?: {
    slotIndex: number;
    outgoingRosterIndex: number;
    incomingRosterIndex: number;
    historyIndex: number;
    resumeHistoryIndex: number;
    pickupCell: [number, number];
    dropCell: [number, number];
    dropPath: [number, number][];
    bridgeDuration: number;
    pickupArriveAbsS: number;
    outgoingHiddenAbsS: number;
    dropArriveAbsS: number;
    incomingSpawnAbsS: number;
    incomingReadyAbsS: number;
    incomingMoveAbsS: number;
    addedDelay: number;
  }[];
}): {
  animationStyles: string;
  sheepGroups: string;
  cameraSheepGroups: string;
  cameraTracks: Map<number, { atS: number; x: number; y: number }[]>;
} {
  const {
    positionsHistory,
    assignedIndices,
    spawnAbsS,
    moveStartAbsS,
    biteAbsSBySheep,
    biteProgressBySheep,
    maxTotalTime,
    gridLeftX,
    gridTopY,
    lightRampS,
    sheepFadeS,
    pickupArriveAbsS,
    pickupFadeS = 0.25,
    pickupWaitS,
    pickupLightS,
    relocation,
    turnovers = [],
  } = params;
  const animationDuration = (maxTotalTime * MOTION_TIME_SCALE).toFixed(3);

  const sheepScale = (SHEEP_WIDTH_PX / SHEEP_VIEWBOX_W / 2.05) * 0.8;
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
      return {
        id: `sheep-${si}`,
        keyframes: "",
        animationCSS: "",
        poseCSS: "",
        rosterActors: [],
        cameraTrack: [],
      };
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
      let angle = fallback;
      if (dx > 0) angle = 90;
      else if (dx < 0) angle = 270;
      else if (dy > 0) angle = 180;
      else if (dy < 0) angle = 0;
      while (angle - fallback > 180) angle -= 360;
      while (angle - fallback < -180) angle += 360;
      return angle;
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

      // 루트는 셀 경계에서 멈추지 않는다. 방향은 실제 이동과 함께 최단 각도로 바뀐다.
      frames.push({
        t: tickEnd,
        x: next[0],
        y: next[1],
        angle: nextAngle,
      });

      lastAngle = nextAngle;
      time = tickEnd;
    }

    const timeOffset = spawnAbsS[si] ?? 0;
    const keyframeEntries: { pct: number; css: string }[] = [];
    const poseEntries: { pct: number; css: string }[] = [];
    const headEntries: { pct: number; css: string }[] = [];
    const growthEntries: { pct: number; css: string }[] = [];
    const energyEntries: { pct: number; css: string }[] = [];
    const bites = [...(biteAbsSBySheep[si] ?? [])].sort((a, b) => a - b);
    const biteProgress = [...(biteProgressBySheep[si] ?? [])].sort(
      (a, b) => a.atS - b.atS,
    );
    const slotTurnovers = turnovers.filter(
      (turnover) => turnover.slotIndex === si,
    );
    const turnoverDelayAt = (historyIndex: number) =>
      slotTurnovers
        .filter((turnover) => historyIndex >= turnover.historyIndex)
        .reduce((sum, turnover) => sum + turnover.addedDelay, 0);
    const addProgress = (atS: number, progress: number) => {
      const pct = Math.min(
        99.9999,
        Math.max(0, maxTotalTime > 0 ? (atS * 100) / maxTotalTime : 0),
      );
      const eased = Math.sqrt(Math.min(1, Math.max(0, progress)));
      growthEntries.push({
        pct,
        css: `${pct.toFixed(4)}% { transform: scale(${(1 + eased * 0.15).toFixed(3)}); }`,
      });
      energyEntries.push({
        pct,
        css: `${pct.toFixed(4)}% { opacity: ${(eased * 0.48).toFixed(3)}; }`,
      });
    };
    const addPose = (atS: number, transform: string) => {
      const pct = Math.min(
        99.9999,
        Math.max(0, maxTotalTime > 0 ? (atS * 100) / maxTotalTime : 0),
      );
      poseEntries.push({
        pct,
        css: `${pct.toFixed(4)}% { transform: ${transform}; }`,
      });
    };
    const addHead = (atS: number, y: number) => {
      const pct = Math.min(
        99.9999,
        Math.max(0, maxTotalTime > 0 ? (atS * 100) / maxTotalTime : 0),
      );
      headEntries.push({
        pct,
        css: `${pct.toFixed(4)}% { transform: translate(0px, ${(-1.55 + y).toFixed(2)}px); }`,
      });
    };
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
    const initialDropTransform = `translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
    const pctSpawn = maxTotalTime > 0 ? (timeOffset * 100) / maxTotalTime : 0;
    keyframeEntries.push({
      pct: 0,
      css: `0% { transform: ${initialDropTransform}; opacity: 0; }`,
    });
    if (pctSpawn > 0) {
      keyframeEntries.push({
        pct: Math.min(100, pctSpawn),
        css: `${Math.min(100, pctSpawn).toFixed(4)}% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; animation-timing-function: cubic-bezier(.2, .75, .25, 1); }`,
      });
    } else {
      keyframeEntries.push({
        pct: 0,
        css: `0% { transform: translate(${dropX}px, ${dropY}px) rotate(${dropFrame.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 0; animation-timing-function: cubic-bezier(.2, .75, .25, 1); }`,
      });
    }
    const readyTime = timeOffset + (lightRampS + sheepFadeS);
    const moveStartTime = Math.max(moveStartAbsS[si] ?? 0, readyTime);
    const pctReady = maxTotalTime > 0 ? (readyTime * 100) / maxTotalTime : 0;
    const pctMoveStart =
      maxTotalTime > 0 ? (moveStartTime * 100) / maxTotalTime : 0;
    const landingSpan = Math.max(0.01, readyTime - timeOffset);
    addPose(timeOffset, "scale(.9, 1.08)");
    addPose(
      timeOffset + landingSpan * 0.72,
      "scale(.97, 1.03)",
    );
    addPose(readyTime, "scale(1.08, .9)");
    addPose(readyTime + 0.09, "scale(.98, 1.03)");
    addPose(readyTime + 0.18, "scale(1, 1)");
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
        if (
          slotTurnovers.some(
            (turnover) =>
              fi >= turnover.historyIndex &&
              fi < turnover.resumeHistoryIndex,
          )
        ) continue;
        const { x, y } = getCellCenterPx(gridLeftX, gridTopY, f.x, f.y);
        const off = bodyShift(f.angle);
        const globalTime =
          moveStartTime +
          (f.t - firstMoveT) +
          SHEEP_CELL_TIME +
          turnoverDelayAt(fi) +
          (relocation?.sheepIndex === si && fi >= relocation.historyIndex
            ? relocation.operationDuration
            : 0);
        const percent =
          maxTotalTime > 0 ? (globalTime * 100) / maxTotalTime : 0;
        const pct = Math.min(99.9999, percent);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: translate(${x + off.dx}px, ${y + off.dy}px) rotate(${f.angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px); opacity: 1; animation-timing-function: linear; }`,
        });
      }

      for (let ti = firstMoveIdxHistory; ti < timeline.length; ti++) {
        if (
          slotTurnovers.some(
            (turnover) =>
              ti >= turnover.historyIndex &&
              ti < turnover.resumeHistoryIndex,
          )
        ) continue;
        const prev = timeline[ti - 1];
        const current = timeline[ti];
        if (!prev || !current) continue;
        const segmentStart =
          moveStartTime +
          (ti - firstMoveIdxHistory) * SHEEP_CELL_TIME +
          turnoverDelayAt(ti) +
          (relocation?.sheepIndex === si && ti >= relocation.historyIndex
            ? relocation.operationDuration
            : 0);
        const moved = prev[0] !== current[0] || prev[1] !== current[1];
        if (moved) {
          if (ti === firstMoveIdxHistory) {
            addPose(
              segmentStart - 0.1,
              "translateY(0) scale(1, 1)",
            );
            addPose(
              segmentStart - 0.04,
              "translateY(.45px) scale(.92, 1.06)",
            );
            addPose(
              segmentStart + 0.08,
              "translateY(-.8px) scale(1.08, .94)",
            );
            addPose(segmentStart + 0.22, "translateY(0) scale(1, 1)");
          } else {
            addPose(segmentStart, "translateY(0) scale(1, 1)");
            addPose(
              segmentStart + SHEEP_CELL_TIME * 0.46,
              "translateY(-.7px) scale(1.015, .985)",
            );
            addPose(
              segmentStart + SHEEP_CELL_TIME,
              "translateY(0) scale(1, 1)",
            );
          }
        }
      }

      for (const [biteIndex, biteStart] of bites.entries()) {
        addPose(
          biteStart - BITE_ANTICIPATION_S,
          "translateY(-.2px) scale(.96, 1.04)",
        );
        addPose(biteStart, "translateY(.25px) scale(.94, 1.06)");
        addPose(
          biteStart + BITE_IMPACT_S,
          "translateY(.65px) scale(1.08, .9)",
        );
        addPose(biteStart + 0.2, "translateY(-.45px) scale(.96, 1.04)");
        addPose(biteStart + BITE_RELEASE_S, "translateY(0) scale(1, 1)");
        addHead(biteStart - BITE_ANTICIPATION_S, 0);
        addHead(biteStart, 0.35);
        addHead(biteStart + BITE_IMPACT_S, -1.35);
        addHead(biteStart + 0.18, -0.35);
        addHead(biteStart + BITE_RELEASE_S, 0);
        addProgress(
          biteStart + BITE_RELEASE_S,
          biteProgress[biteIndex]?.progress ??
            (biteIndex + 1) / Math.max(1, bites.length),
        );
      }
    }

    for (const turnover of slotTurnovers) {
      const turnoverAngle =
        frames[Math.min(turnover.historyIndex, frames.length - 1)]?.angle ??
        lastAngle;
      const transformAt = (cell: [number, number], angle: number) => {
        const point = getCellCenterPx(gridLeftX, gridTopY, cell[0], cell[1]);
        const off = bodyShift(angle);
        return `translate(${point.x + off.dx}px, ${point.y + off.dy}px) rotate(${angle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
      };
      const sourceTransform = transformAt(turnover.pickupCell, turnoverAngle);
      const bridgeAngleOf = (dx: number, dy: number, fallback: number) => {
        if (dx === 0 && dy === 0) return fallback;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        while (angle - fallback > 180) angle -= 360;
        while (angle - fallback < -180) angle += 360;
        return Number(angle.toFixed(2));
      };
      let bridgeAngle = 180;
      const dropTransform = transformAt(turnover.dropCell, bridgeAngle);
      const landingAbsS = Math.max(
        turnover.incomingSpawnAbsS,
        turnover.incomingReadyAbsS - 0.06,
      );
      for (const [atS, transform, opacity] of [
        [turnover.pickupArriveAbsS, sourceTransform, 1],
        [turnover.outgoingHiddenAbsS, sourceTransform, 0],
        [turnover.dropArriveAbsS, dropTransform, 0],
        [turnover.incomingSpawnAbsS, dropTransform, 0],
        [landingAbsS, dropTransform, 1],
        [turnover.incomingReadyAbsS, dropTransform, 1],
        [turnover.incomingMoveAbsS, dropTransform, 1],
      ] as const) {
        const pct = Math.min(99.9999, (atS * 100) / maxTotalTime);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: ${transform}; opacity: ${opacity}; }`,
        });
      }
      for (let index = 1; index < turnover.dropPath.length; index++) {
        const previous = turnover.dropPath[index - 1];
        const cell = turnover.dropPath[index];
        bridgeAngle = bridgeAngleOf(
          cell[0] - previous[0],
          cell[1] - previous[1],
          bridgeAngle,
        );
        const stepDuration =
          turnover.bridgeDuration / (turnover.dropPath.length - 1);
        const atS = turnover.incomingMoveAbsS + stepDuration * index;
        const pct = Math.min(99.9999, (atS * 100) / maxTotalTime);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: ${transformAt(cell, bridgeAngle)}; opacity: 1; animation-timing-function: linear; }`,
        });
        addPose(atS - stepDuration, "translateY(0) scale(1, 1)");
        addPose(
          atS - stepDuration * 0.54,
          "translateY(-.7px) scale(1.015, .985)",
        );
        addPose(atS, "translateY(0) scale(1, 1)");
      }
      addPose(turnover.pickupArriveAbsS, "translateY(0) scale(1, 1)");
      addPose(turnover.outgoingHiddenAbsS, "translateY(-6px) scale(.86, 1.1)");
      addPose(turnover.incomingSpawnAbsS, "scale(.62, .62)");
      addPose(landingAbsS, "scale(1.12, .88)");
      addPose(turnover.incomingReadyAbsS, "scale(1, 1)");
      addPose(turnover.incomingMoveAbsS, "scale(1, 1)");
      addProgress(turnover.outgoingHiddenAbsS, 1);
      addProgress(turnover.incomingSpawnAbsS, 0);
    }

    const pickupT = pickupArriveAbsS?.[si] ?? null;
    const pickupFade = pickupFadeS ?? 0.25;
    const pickupWait = pickupWaitS ?? 0.35;
    const pickupLight = pickupLightS ?? 0.22;

    if (relocation?.sheepIndex === si) {
      const source = getCellCenterPx(
        gridLeftX,
        gridTopY,
        relocation.from[0],
        relocation.from[1],
      );
      const target = getCellCenterPx(
        gridLeftX,
        gridTopY,
        relocation.to[0],
        relocation.to[1],
      );
      const relocationOff = bodyShift(lastAngle);
      const sourceTransform = `translate(${source.x + relocationOff.dx}px, ${source.y + relocationOff.dy}px) rotate(${lastAngle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
      const targetTransform = `translate(${target.x + relocationOff.dx}px, ${target.y + relocationOff.dy}px) rotate(${lastAngle}deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
      for (const [atS, transform, opacity] of [
        [relocation.pickupArriveAbsS, sourceTransform, 1],
        [relocation.flightStartAbsS, sourceTransform, 0],
        [relocation.dropArriveAbsS - 0.001, sourceTransform, 0],
        [relocation.dropArriveAbsS, targetTransform, 0],
        [relocation.releaseAbsS, targetTransform, 1],
      ] as const) {
        const pct = Math.min(99.9999, (atS * 100) / maxTotalTime);
        keyframeEntries.push({
          pct,
          css: `${pct.toFixed(4)}% { transform: ${transform}; opacity: ${opacity}; }`,
        });
      }
      addPose(relocation.pickupArriveAbsS, "translateY(0) scale(1, 1)");
      addPose(relocation.flightStartAbsS, "translateY(-5px) scale(.88, 1.08)");
      addPose(relocation.dropArriveAbsS, "translateY(-2px) scale(.92, 1.05)");
      addPose(relocation.releaseAbsS, "translateY(.8px) scale(1.08, .9)");
      addPose(relocation.releaseAbsS + 0.14, "translateY(0) scale(1, 1)");
    }

    if (pickupT != null && Number.isFinite(pickupT) && pickupT > 0) {
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
      addPose(fadeStartT, "translateY(0) scale(1, 1)");
      addPose(
        fadeStartT + pickupFade,
        "translateY(-6px) scale(.86, 1.1)",
      );
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
    const initialTransform = `transform: ${initialDropTransform}; opacity: 0; `;

    const sorted = keyframeEntries.slice().sort((a, b) => a.pct - b.pct);
    const unique: typeof sorted = [];
    let lastPct: number | null = null;
    for (const kf of sorted) {
      if (lastPct !== null && Math.abs(kf.pct - lastPct) < 1e-6) {
        unique[unique.length - 1] = kf;
      } else {
        unique.push(kf);
        lastPct = kf.pct;
      }
    }
    let renderedAngle = 180;
    const deduped = unique.map(({ css }) =>
      css.replace(/rotate\(([-\d.]+)deg\)/, (_, raw) => {
        let angle = Number(raw);
        while (angle - renderedAngle > 180) angle -= 360;
        while (angle - renderedAngle < -180) angle += 360;
        renderedAngle = angle;
        return `rotate(${angle}deg)`;
      }),
    );
    const cameraTrack = unique.flatMap(({ pct, css }) => {
      const match = css.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      return match == null
        ? []
        : [{
            atS: (pct * maxTotalTime) / 100,
            x: Number(match[1]),
            y: Number(match[2]),
          }];
    });

    poseEntries.push({
      pct: 100,
      css: `100% { transform: ${hasPickup ? "translateY(-6px) scale(.86, 1.1)" : "translateY(0) scale(1, 1)"}; }`,
    });
    headEntries.push({
      pct: 0,
      css: "0% { transform: translate(0px, -1.55px); }",
    });
    headEntries.push({
      pct: 100,
      css: "100% { transform: translate(0px, -1.55px); }",
    });
    addProgress(timeOffset, 0);
    const sortedPose = poseEntries.slice().sort((a, b) => a.pct - b.pct);
    const dedupedPose: string[] = [];
    let lastPosePct: number | null = null;
    for (const kf of sortedPose) {
      if (lastPosePct !== null && Math.abs(kf.pct - lastPosePct) < 1e-6) {
        dedupedPose[dedupedPose.length - 1] = kf.css;
      } else {
        dedupedPose.push(kf.css);
        lastPosePct = kf.pct;
      }
    }
    const sortedHead = headEntries.slice().sort((a, b) => a.pct - b.pct);
    const dedupedHead: string[] = [];
    let lastHeadPct: number | null = null;
    for (const kf of sortedHead) {
      if (lastHeadPct !== null && Math.abs(kf.pct - lastHeadPct) < 1e-6) {
        dedupedHead[dedupedHead.length - 1] = kf.css;
      } else {
        dedupedHead.push(kf.css);
        lastHeadPct = kf.pct;
      }
    }
    const dedupeTimedCss = (entries: { pct: number; css: string }[]) => {
      const sorted = entries.slice().sort((a, b) => a.pct - b.pct);
      const out: string[] = [];
      let previous: number | null = null;
      for (const entry of sorted) {
        if (previous !== null && Math.abs(entry.pct - previous) < 1e-6)
          out[out.length - 1] = entry.css;
        else {
          out.push(entry.css);
          previous = entry.pct;
        }
      }
      return out;
    };
    const dedupedGrowth = dedupeTimedCss(growthEntries);
    const dedupedEnergy = dedupeTimedCss(energyEntries);
    const finalHiddenAbsS = hasPickup
      ? pickupT + pickupWait + pickupLight * 0.6 + pickupFade
      : maxTotalTime;
    const orderedTurnovers = slotTurnovers.slice().sort(
      (a, b) => a.incomingSpawnAbsS - b.incomingSpawnAbsS,
    );
    const rosterActors = [
      {
        rosterIndex: orderedTurnovers[0]?.outgoingRosterIndex ?? si,
        start: timeOffset,
        end: orderedTurnovers[0]?.outgoingHiddenAbsS ?? finalHiddenAbsS,
      },
      ...orderedTurnovers.map((turnover, index) => ({
        rosterIndex: turnover.incomingRosterIndex,
        start: turnover.incomingSpawnAbsS,
        end:
          orderedTurnovers[index + 1]?.outgoingHiddenAbsS ?? finalHiddenAbsS,
      })),
    ].map(({ rosterIndex, start, end }) => {
      const name = `sheep-roster-${rosterIndex}-visible`;
      const startPct = Math.max(0, (start * 100) / maxTotalTime);
      const endPct = Math.min(100, (end * 100) / maxTotalTime);
      const finalVisibility = endPct < 100 ? "hidden" : "visible";
      return {
        rosterIndex,
        start,
        end,
        keyframes: `@keyframes ${name} {
    0% { visibility:hidden; }
    ${Math.max(0, startPct - 0.0001).toFixed(4)}% { visibility:hidden; }
    ${startPct.toFixed(4)}% { visibility:visible; }
    ${Math.max(startPct, endPct - 0.0001).toFixed(4)}% { visibility:visible; }
    ${endPct.toFixed(4)}% { visibility:${finalVisibility}; }
    100% { visibility:${finalVisibility}; }
  }`,
        animationCSS: `visibility:hidden;animation:${name} ${animationDuration}s steps(1,end) 0s 1 both;`,
      };
    });

    return {
      id: `sheep-${si}`,
      keyframes: `@keyframes sheep-${si}-move {\n    ${deduped.join("\n    ")}\n  }\n  @keyframes sheep-${si}-pose {\n    ${dedupedPose.join("\n    ")}\n  }\n  @keyframes sheep-${si}-head {\n    ${dedupedHead.join("\n    ")}\n  }\n  @keyframes sheep-${si}-growth {\n    ${dedupedGrowth.join("\n    ")}\n    100% { transform: scale(${biteProgress.length > 0 ? (1 + Math.sqrt(biteProgress.at(-1)!.progress) * 0.15).toFixed(3) : 1}); }\n  }\n  @keyframes sheep-${si}-energy {\n    ${dedupedEnergy.join("\n    ")}\n    100% { opacity: ${biteProgress.length > 0 ? (Math.sqrt(biteProgress.at(-1)!.progress) * 0.48).toFixed(3) : 0}; }\n  }\n  .sheep-${si} .sheep-head { transform-box: fill-box; transform-origin: center; animation: sheep-${si}-head ${animationDuration}s cubic-bezier(.2,.8,.2,1) 0s 1 both; }\n  .sheep-${si} .sheep-growth { transform-box: fill-box; transform-origin: center; animation: sheep-${si}-growth ${animationDuration}s cubic-bezier(.2,.8,.2,1) 0s 1 both; }\n  .sheep-${si} .sheep-energy { animation: sheep-${si}-energy ${animationDuration}s linear 0s 1 both; }`,
      animationCSS: `${initialTransform}animation: sheep-${si}-move ${animationDuration}s linear ${delay * MOTION_TIME_SCALE}s 1 both;`,
      poseCSS: `transform-box:fill-box; transform-origin:center; animation:sheep-${si}-pose ${animationDuration}s linear 0s 1 both;`,
      headCSS: `transform-box:fill-box; transform-origin:center; animation:sheep-${si}-head ${animationDuration}s cubic-bezier(.2,.8,.2,1) 0s 1 both;`,
      rosterActors,
      cameraTrack,
    };
  });

  const validSheepAnimations = sheepAnimations.filter(
    (a: { keyframes: string }) => a.keyframes.length > 0,
  );
  const animationStyles = validSheepAnimations
    .flatMap((a) => [
      a.keyframes,
      ...a.rosterActors.map((actor) => actor.keyframes),
    ])
    .join("\n  ");

  let sheepGroups: string;
  let cameraSheepGroups: string;
  if (validSheepAnimations.length > 0) {
    const renderGroups = (camera: boolean) => validSheepAnimations
      .flatMap((a) => a.rosterActors.map((actor) =>
        `<g class="${camera ? "camera-sheep-roster" : "sheep-roster"}-${actor.rosterIndex}${camera ? " sheep-camera-copy" : ""}" data-${camera ? "camera-" : ""}roster-index="${actor.rosterIndex}" style="${actor.animationCSS}"><g class="${a.id}" style="${a.animationCSS}"><g class="sheep-growth"><g class="sheep-actor" style="${a.poseCSS}">${SHEEP_CONTENT}<g class="sheep-ear-tag" transform="translate(0,-1.55)" style="${a.headCSS}">${buildSheepTagSvg({ rosterIndex: actor.rosterIndex, x: 3, y: 4.55, size: 2.1, className: camera ? "sheep-camera-tag" : "sheep-field-tag", strokeWidth: 0.22 })}</g><path class="sheep-energy" d="M4.8 6.2Q6.1 5.1 7.1 6.2M7.3 8.5Q8.4 7.2 9.5 8.1M9.2 5.3Q10.3 4.7 11.1 5.8" fill="none" stroke="var(--gm-level-3)" stroke-width=".75" stroke-linecap="round" opacity="0"/></g></g></g></g>`,
      )).join("\n  ");
    sheepGroups = renderGroups(false);
    cameraSheepGroups = renderGroups(true);
  } else {
    const pos = getCellCenterPx(gridLeftX, gridTopY, 0, 0);
    const off = bodyShift(180);
    const transform = `translate(${pos.x + off.dx}px, ${pos.y + off.dy}px) rotate(180deg) scale(${sheepScale}) translate(${-SHEEP_VIEWBOX_CX}px, ${-SHEEP_VIEWBOX_CY}px)`;
    sheepGroups = `<g class="sheep-fallback" transform="${transform}">${SHEEP_CONTENT}</g>`;
    cameraSheepGroups = sheepGroups;
  }

  const cameraTracks = new Map<number, { atS: number; x: number; y: number }[]>();
  for (const animation of validSheepAnimations) {
    for (const actor of animation.rosterActors) {
      cameraTracks.set(
        actor.rosterIndex,
        animation.cameraTrack.filter(
          ({ atS }) => atS >= actor.start - 0.001 && atS <= actor.end + 0.001,
        ),
      );
    }
  }

  return { animationStyles, sheepGroups, cameraSheepGroups, cameraTracks };
}
