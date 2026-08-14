import { getCellCenterPx } from "../layout/gridLayout.js";
import { getColor } from "../contribution.js";
import { GRASS_STEP_TIMES_S, MOTION_TIME_SCALE } from "../constants.js";

/** 첫 물기 한 번에만 반응을 모아 작은 README에서도 시작점이 읽히게 함. */
const BITE_IMPACT_S = GRASS_STEP_TIMES_S[0];
/** 셀당 파티클 개수 */
const CRUMB_COUNT_MIN = 2;
const CRUMB_COUNT_MAX = 3;
/** 파티클 하나가 중심 → 최종 위치까지 가는 시간 */
const CRUMB_DURATION_S = 0.32;
/** 네모 부스러기 한 변(px). 잎은 별도 w/h */
const CRUMB_SIZE = 1.1;
/** 퍼지는 거리(px) */
const SPREAD_PX_MIN = 3;
const SPREAD_PX_MAX = 8;

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
  timeOffset?: number;
}): { crumbKeyframes: string; crumbGroup: string } {
  const {
    firstArrivals,
    gridLeftX,
    gridTopY,
    timeOffset = 0,
  } = params;

  const groupParts: string[] = [];
  let burstIndex = 0;

  for (const [key, { arrivalTime, level, directionRad }] of firstArrivals) {
    const [col, row] = key.split(",").map(Number);
    const { x: cx, y: cy } = getCellCenterPx(gridLeftX, gridTopY, col, row);
    const eatingStartTime = timeOffset + arrivalTime;
    const grassColor =
      level >= 4 ? "#7ee787" : getColor(Math.min(4, level + 1));
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

      const jitter = (seededRandom(burstIndex * 41 + i * 53) - 0.5) * 0.04;
      const delayS = Math.max(0, BITE_IMPACT_S + jitter);
      const particleStartTime = (
        (eatingStartTime + delayS) *
        MOTION_TIME_SCALE
      ).toFixed(4);

      /* 네모(80%) + 잎 조각(20%). 개별 좌표만 CSS 변수로 넘기고 모션은 공유한다. */
      const isLeaf = seededRandom(burstIndex * 333 + i * 77) < 0.2;
      const w = isLeaf ? 3 : CRUMB_SIZE * 2;
      const h = isLeaf ? 1.2 : CRUMB_SIZE * 2;
      const rot = (seededRandom(burstIndex * 999 + i * 555) * 90 - 45).toFixed(
        1,
      );
      const x = (-w / 2).toFixed(2);
      const y = (-h / 2).toFixed(2);

      particles.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" ry="0.6" fill="${grassColor}" style="--crumb-x:${dx.toFixed(2)}px; --crumb-y:${dy.toFixed(2)}px; --crumb-mid-x:${(dx * 0.55).toFixed(2)}px; --crumb-mid-y:${(dy * 0.55).toFixed(2)}px; --crumb-rot:${rot}deg; opacity:0; visibility:hidden; transform-box:fill-box; transform-origin:center; animation:grass-crumb ${(CRUMB_DURATION_S * MOTION_TIME_SCALE).toFixed(3)}s cubic-bezier(.2,.75,.25,1) ${particleStartTime}s 1 forwards; pointer-events:none;" aria-hidden="true"/>`,
      );
    }

    groupParts.push(
      `<g transform="translate(${startX.toFixed(2)}, ${startY.toFixed(2)})" aria-hidden="true">${particles.join("")}</g>`,
    );
    burstIndex++;
  }

  return {
    crumbKeyframes:
      groupParts.length > 0
        ? `
  @keyframes grass-crumb {
    0% { visibility: visible; opacity: 0; transform: rotate(var(--crumb-rot)) translate(0, 0) scale(0.72); }
    45% { visibility: visible; opacity: 0.85; transform: rotate(var(--crumb-rot)) translate(var(--crumb-mid-x), var(--crumb-mid-y)) scale(1); }
    100% { visibility: hidden; opacity: 0; transform: rotate(var(--crumb-rot)) translate(var(--crumb-x), var(--crumb-y)) scale(0.82); }
  }`
        : "",
    crumbGroup:
      groupParts.length > 0
        ? `<g id="grass-crumbs" aria-hidden="true">${groupParts.join("")}</g>`
        : "",
  };
}
