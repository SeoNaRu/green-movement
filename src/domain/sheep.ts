/** 양 상태 머신 단계 (애니메이션/시뮬 구분용) */
export enum SheepPhase {
  SPAWNED = "SPAWNED",
  DROPPED = "DROPPED",
  MOVING = "MOVING",
  EATING = "EATING",
  WAITING = "WAITING",
  PICKED_UP = "PICKED_UP",
}

/** 시뮬레이션용 양 상태 (위치·경로·목표·먹는 중) */
export type SheepState = {
  pos: [number, number];
  plan: [number, number][];
  goalGrassKey: string | null;
  eatUntil: number;
  stuck: number;
  eatingGrassKey: string | null;
};
