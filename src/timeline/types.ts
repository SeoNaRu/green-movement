/** 타임라인 빌더 출력: 레이어/컴포즈에 전달 */
export type TimelineResult = {
  timelineOffset: number;
  maxTotalTimeWithEntryExit: number;
  firstArrivals: Map<string, { arrivalTime: number; level: number }>;
  ufoArriveAbsSOffset: number[];
  spawnAbsSOffset: number[];
  readyAbsSOffset: number[];
  moveStartAbsSOffset: number[];
  ufoLeaveAbsSOffset: number[];
  pickupCells: [number, number][];
  pickupArriveBySheep: (number | null)[];
  pickupArriveAbsSOffsetForUfo: number[];
  pickupArriveAbsSOffset: (number | null)[];
  sweepPositions: [number, number][];
  sweepArriveAbsSOffset: number[];
  paintSweepStartAbsSOffset: number;
  paintSweepDuration: number;
  paintWaveSpeedS: number;
  paintCenterCol: number;
  paintCenterRow: number;
  activeSheepIndices: number[];
  assignedIndices: number[];
};
