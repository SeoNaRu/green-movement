import { getCellCenterPx } from "../gridLayout.js";
import { getColor } from "../contribution.js";
import { GRASS_STEP_TIMES_S } from "../constants.js";

/** 먹는 동안 2~3번 씹는 비트(초). 이 시점에 파티클이 몰려서 “씹는” 느낌 */
/** 잔디 단계(4→3→2→1)와 맞추기 위해 GRASS_STEP_TIMES_S 앞 3구간에서 파티클 터짐 */
const CHEW_BEATS_S = GRASS_STEP_TIMES_S.slice(0, 3);
/** 셀당 파티클 개수 */
const CRUMB_COUNT_MIN = 2;
const CRUMB_COUNT_MAX = 10;
/** 파티클 하나가 중심 → 최종 위치까지 가는 시간 */
const CRUMB_DURATION_S = 0.55;
/** 네모 부스러기 한 변(px). 잎은 별도 w/h */
const CRUMB_SIZE = 1.2;
/** 퍼지는 거리(px) */
const SPREAD_PX_MIN = 2;
const SPREAD_PX_MAX = 10;

/** 퍼짐 콘: 입 방향 기준 이 각도 안에서만 튀어서 “먹는 방향”이 보이게 */
const CONE_RAD = Math.PI / 3;
/** directionRad 없을 때 쓰는 기본 입 방향(rad) */
const DEFAULT_MOUTH_ANGLE = Math.PI * 0.75;

/**
 * 파티클 시작 위치 오프셋(px).
 * 셀 중심에서 먹는 방향(그리드 외각 쪽)으로 이만큼 밀어서 시작.
 * 키우면 외각에서 더 떨어진 쪽에서 터짐, 줄이면 셀 중심에 가깝게.
 */
const CRUMB_START_OFFSET_PX = 3;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function buildGrassCrumbsLayer(params: {
  firstArrivals: Map<
    string,
    { arrivalTime: number; level: number; directionRad?: number }
  >;
  gridLeftX: number;
  gridTopY: number;
  maxTotalTime: number;
  timeOffset?: number;
}): { crumbKeyframes: string; crumbGroup: string } {
  const {
    firstArrivals,
    gridLeftX,
    gridTopY,
    maxTotalTime,
    timeOffset = 0,
  } = params;

  const keyframesOut: string[] = [];
  const groupParts: string[] = [];
  let burstIndex = 0;

  for (const [key, { arrivalTime, level, directionRad }] of firstArrivals) {
    const [col, row] = key.split(",").map(Number);
    const { x: cx, y: cy } = getCellCenterPx(gridLeftX, gridTopY, col, row);
    const eatingStartTime = timeOffset + arrivalTime;
    const grassColor = getColor(Math.max(1, level));
    /* 양이 이 칸에 들어온 방향 = 파티클 퍼짐 방향 + 시작 위치 오프셋 방향 */
    const mouthAngle =
      directionRad !== undefined ? directionRad : DEFAULT_MOUTH_ANGLE;
    const startOffsetX = Math.cos(mouthAngle) * CRUMB_START_OFFSET_PX;
    const startOffsetY = Math.sin(mouthAngle) * CRUMB_START_OFFSET_PX;
    const startX = cx + startOffsetX;
    const startY = cy + startOffsetY;

    const n =
      CRUMB_COUNT_MIN +
      Math.floor(
        seededRandom(burstIndex * 7) * (CRUMB_COUNT_MAX - CRUMB_COUNT_MIN + 1),
      );

    const particles: string[] = [];
    for (let i = 0; i < n; i++) {
      /* 씹는 방향성: 양 입장 방향(mouthAngle) 기준 콘 안에서만 퍼짐 */
      const dist =
        SPREAD_PX_MIN +
        seededRandom(burstIndex * 17.2 + i * 19.3) *
          (SPREAD_PX_MAX - SPREAD_PX_MIN);
      const angle =
        mouthAngle -
        CONE_RAD / 2 +
        seededRandom(burstIndex * 1009 + i * 1013 + 7) * CONE_RAD;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;

      /* 씹는 비트: 고정 비트 시점 + 약간 랜덤 → 2~3번 씹는 느낌 */
      const beatIdx = Math.min(
        CHEW_BEATS_S.length - 1,
        Math.floor(
          seededRandom(burstIndex * 23.4 + i * 29.5) * CHEW_BEATS_S.length,
        ),
      );
      const beat = CHEW_BEATS_S[beatIdx];
      const jitter = (seededRandom(burstIndex * 41 + i * 53) - 0.5) * 0.12;
      const delayS = Math.max(0, beat + jitter);
      const particleStartTime = eatingStartTime + delayS;

      const kfName = `crumb-${burstIndex}-${i}`;

      /* 네모(80%) + 잎 조각(20%). 회전은 키프레임에 포함해 애니 중 유지 */
      const isLeaf = seededRandom(burstIndex * 333 + i * 77) < 0.2;
      const w = isLeaf ? 3.2 : CRUMB_SIZE * 2;
      const h = isLeaf ? 1.2 : CRUMB_SIZE * 2;
      const rot = (seededRandom(burstIndex * 999 + i * 555) * 90 - 45).toFixed(
        1,
      );
      const x = (-w / 2).toFixed(2);
      const y = (-h / 2).toFixed(2);
      const rotTf = `rotate(${rot}deg)`;

      keyframesOut.push(`
  @keyframes ${kfName} {
    0% {
      visibility: visible;
      opacity: 0.35;
      transform: ${rotTf} translate(0px, 0px) scale(0.9);
    }
    30% {
      opacity: 1;
      transform: ${rotTf} translate(${(dx * 0.4).toFixed(2)}px, ${(dy * 0.4).toFixed(2)}px) scale(1);
    }
    70% {
      opacity: 1;
      transform: ${rotTf} translate(${(dx * 0.85).toFixed(2)}px, ${(dy * 0.85).toFixed(2)}px) scale(1);
    }
    88% {
      opacity: 0.4;
      transform: ${rotTf} translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(0.95);
    }
    100% {
      visibility: hidden;
      opacity: 0;
      transform: ${rotTf} translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(0.9);
    }
  }`);

      particles.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" ry="0.6" fill="${grassColor}" style="transform-box: fill-box; transform-origin: center; animation: ${kfName} ${CRUMB_DURATION_S}s linear ${particleStartTime}s 1 forwards; pointer-events: none;" aria-hidden="true"/>`,
      );
    }

    groupParts.push(
      `<g transform="translate(${startX.toFixed(2)}, ${startY.toFixed(2)})" aria-hidden="true">${particles.join("")}</g>`,
    );
    burstIndex++;
  }

  return {
    crumbKeyframes: keyframesOut.join(""),
    crumbGroup:
      groupParts.length > 0
        ? `<g id="grass-crumbs" aria-hidden="true">${groupParts.join("")}</g>`
        : "",
  };
}
