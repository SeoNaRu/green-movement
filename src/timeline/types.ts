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
  /** UFO가 실제로 방문하는 드롭 개수 (잔디 소모 후 회수 시작 시점에 맞춤) */
  effectiveDropCount: number;
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
