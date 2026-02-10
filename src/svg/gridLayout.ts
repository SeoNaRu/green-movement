// 기존 경로(`./gridLayout`)를 유지하기 위한 호환 래퍼.
// 실제 구현은 `./layout/gridLayout.ts`로 이동했다.

export {
  getCellCenterPx,
  buildFencePieces,
  type FenceLayout,
} from "./layout/gridLayout.js";
