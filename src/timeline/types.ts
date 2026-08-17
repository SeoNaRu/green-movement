/** 타임라인 빌더 출력: 레이어/컴포즈에 전달 */
export type TimelineResult = {
  timelineOffset: number;
  maxTotalTimeWithEntryExit: number;
  firstArrivals: Map<
    string,
    { arrivalTime: number; level: number; sheepIndex: number; directionRad?: number }
  >;
  ufoArriveAbsSOffset: number[];
  spawnAbsSOffset: number[];
  readyAbsSOffset: number[];
  moveStartAbsSOffset: number[];
  ufoLeaveAbsSOffset: number[];
  ufoStopCells: [number, number][];
  /** UFO가 실제로 방문하는 드롭 개수 (잔디 소모 후 회수 시작 시점에 맞춤) */
  effectiveDropCount: number;
  pickupCells: [number, number][];
  pickupArriveAbsSOffsetForUfo: number[];
  pickupArriveAbsSOffset: (number | null)[];
  relocation: {
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
  turnovers: {
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
    addedDelay: number;
  }[];
  flock: {
    fieldCount: number;
    totalEnergy: number;
    rosterSize: number;
    sheep: {
      rosterIndex: number;
      slotIndex: number;
      inboundAbsS: number | null;
      spawnAbsS: number;
      pickupAbsS: number | null;
      hiddenAbsS: number | null;
      bites: { atS: number; progress: number; level: number }[];
    }[];
    grassProgress: { atS: number; progress: number }[];
  };
  sweepPositions: [number, number][];
  sweepArriveAbsSOffset: number[];
  paintSweepStartAbsSOffset: number;
  paintSweepDuration: number;
  ufoExitStartAbsSOffset: number;
  ufoExitEndAbsSOffset: number;
  assignedIndices: number[];
};
