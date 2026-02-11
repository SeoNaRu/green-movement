import type { GridCell } from "./grid/mapGrid.js";
import { renderGridSvg as renderGridSvgInternal } from "./svg/renderGridSvg.js";

/**
 * GREEN / MOVEMENT 파이프라인 파사드.
 *
 * 최종 퍼블릭 API는 이 함수를 통해서만 SVG 문자열을 생성한다.
 * 현재는 기존 `src/svg/renderGridSvg.ts` 구현을 위임 호출하며,
 * 점진적으로 파이프라인 단계별(builder-style) 구현으로 교체할 예정이다.
 */
export type RenderGridSvgOptions = {
  paintMap?: Record<string, string>;
};

export function renderGridSvg(
  grid: GridCell[],
  options?: RenderGridSvgOptions,
): string {
  return renderGridSvgInternal(grid, options);
}
