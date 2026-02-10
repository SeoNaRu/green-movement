import type { GridCell } from "../grid/mapGrid.js";
import type { SheepState } from "../domain/sheep.js";

export type TargetWithGate = {
  grass: GridCell;
  emptyNeighbor: GridCell;
  gateCol: number;
};

/** 타겟 플래너 결과: 시뮬/타임라인 입력 */
export type PlanResult = {
  sheepCount: number;
  sheepTargetsWithEmpty: (TargetWithGate | undefined)[];
  funnelPositionsEarly: [number, number][];
  paths: [number, number][][];
  emptyCellSet: Set<string>;
  remainingGrassKeys: Set<string>;
  sheepStates: SheepState[];
  spawnTick: number[];
  targetBfsLen: Map<string, number>;
  minFunnelRow: number;
};
