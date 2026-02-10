/**
 * 그리드 레이아웃·울타리 SVG
 *
 * - 셀 좌표(col, row) → 픽셀 위치 변환
 * - GitHub contribution 그리드와 동일한 셀/간격 기준
 * - 울타리: 입구 구간 뺀 상·하·좌·우 펜스 + 코너
 */

import {
  CELL_SIZE,
  GAP,
  FENCE_TILE,
  FENCE_SCALE,
  FENCE_H_PATH,
  FENCE_V_PATH,
  FENCE_CORNER_PATH,
  FENCE_GROUP_STYLE,
} from "../constants.js";

// =============================================================================
// 셀 → 픽셀
// =============================================================================

/**
 * 그리드 내 셀 (col, row)의 정중앙 픽셀 좌표.
 * - 열/행은 0-based (GitHub 그리드와 동일).
 * - 양·UFO·잔디 위치 계산에 사용.
 */
export function getCellCenterPx(
  gridLeftX: number,
  gridTopY: number,
  col: number,
  row: number,
): { x: number; y: number } {
  const x = gridLeftX + col * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  const y = gridTopY + row * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  return { x, y };
}

// =============================================================================
// 울타리 SVG 조각 생성
// =============================================================================

/** 울타리 SVG를 만들 때 필요한 치수 */
export type FenceLayout = {
  /** 그리드 오른쪽 끝 X (울타리 오른쪽 세로선 위치) */
  fenceRightX: number;
  /** 그리드 아래쪽 끝 Y (울타리 아래 가로선 위치) */
  fenceBottomY: number;
};

/**
 * 입구(가운데 4타일)를 뺀 울타리 SVG 문자열 생성.
 * - 상단: 왼쪽 코너 + 가로 펜스 + [입구 구간 생략] + 가로 펜스 + 오른쪽 코너 + 입구 양옆 코너
 * - 좌/우: 세로 펜스 + 코너
 * - 하단: 가로 펜스
 */
export function buildFencePieces(layout: FenceLayout): string {
  const { fenceRightX, fenceBottomY } = layout;
  const g = (x: number, y: number, pathD: string) =>
    `<g transform="translate(${x}, ${y}) scale(${FENCE_SCALE})" ${FENCE_GROUP_STYLE}><path d="${pathD}"/></g>`;
  const gCorner = (
    x: number,
    y: number,
    reflect: "none" | "x" | "y" | "xy",
  ) => {
    const t =
      reflect === "none"
        ? `translate(${x}, ${y}) scale(${FENCE_SCALE})`
        : reflect === "x"
          ? `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(14, 0) scale(-1, 1)`
          : reflect === "y"
            ? `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(0, 14) scale(1, -1)`
            : `translate(${x}, ${y}) scale(${FENCE_SCALE}) translate(14, 14) scale(-1, -1)`;
    return `<g transform="${t}" ${FENCE_GROUP_STYLE}><path d="${FENCE_CORNER_PATH}"/></g>`;
  };

  const GATE_TILES = 4;
  const totalWidth = fenceRightX + FENCE_TILE;
  const gateCenterX = totalWidth / 2;
  const gateStartX =
    Math.floor((gateCenterX - (GATE_TILES * FENCE_TILE) / 2) / FENCE_TILE) *
    FENCE_TILE;
  const gateEndX = gateStartX + (GATE_TILES - 1) * FENCE_TILE;

  const pieces: string[] = [];
  pieces.push(gCorner(0, 0, "none"));
  for (let x = FENCE_TILE; x <= fenceRightX - FENCE_TILE; x += FENCE_TILE) {
    // if (x >= gateStartX && x <= gateEndX) continue;
    pieces.push(g(x, 0, FENCE_H_PATH));
  }
  pieces.push(gCorner(fenceRightX, 0, "x"));
  // pieces.push(gCorner(gateStartX, 0, "xy"));
  // pieces.push(gCorner(gateEndX, 0, "y"));
  for (let y = FENCE_TILE; y <= fenceBottomY - FENCE_TILE; y += FENCE_TILE) {
    pieces.push(g(0, y, FENCE_V_PATH));
  }
  pieces.push(gCorner(0, fenceBottomY, "y"));
  for (let y = FENCE_TILE; y <= fenceBottomY - FENCE_TILE; y += FENCE_TILE) {
    pieces.push(g(fenceRightX, y, FENCE_V_PATH));
  }
  pieces.push(gCorner(fenceRightX, fenceBottomY, "xy"));
  for (let x = FENCE_TILE; x <= fenceRightX - FENCE_TILE; x += FENCE_TILE) {
    pieces.push(g(x, fenceBottomY, FENCE_H_PATH));
  }
  return pieces.join("\n  ");
}
