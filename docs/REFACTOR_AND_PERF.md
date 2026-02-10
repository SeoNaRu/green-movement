# renderGridSvg 리팩터링·성능 개선 계획

## 1. 파일 분리 제안 (기능 유지)

`src/svg/renderGridSvg.ts`(약 2,120줄)를 역할별로 나누면 유지보수와 테스트가 쉬워집니다.

### 제안 구조

| 파일                      | 내용                                                                                                                                                                                                              | 예상 줄 수 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `svg/constants.ts`        | `CELL_SIZE`, `GAP`, `COLORS`, `FENCE_*`, `SHEEP_*`, `waitTicks`, `MAX_MEALS_PER_SHEEP` 등 상수                                                                                                                    | ~100       |
| `svg/reservationTable.ts` | `ReservationTable` 타입, `createReservationTable`, `reserveCell`, `reserveEdge`, `clearReservationsInRange`, `cellKey`, `edgeKeyAtTime` 등                                                                        | ~120       |
| `svg/contribution.ts`     | `getContributionLevel`, `getColor`, `calculateQuartiles` (GitHub 잔디 레벨/색)                                                                                                                                    | ~50        |
| `svg/pathUtils.ts`        | `emptyBfsFromGate`, `tracePath`, `pathBetweenCells`, `pathBetweenGrassCells`, `ensureOnly4Direction`, `addCornerPause`, `isAdjacent4`, `findPrevDifferentIdx`                                                     | ~200       |
| `svg/grassPlanning.ts`    | `planWindowed`, `countFreeNeighbors`, `findPullOverTarget`, `isOnGrass`, `hasWaitedEnough`, `findNearestReachableGrassCandidates`, `findNearestReachableGrassFrom`, `buildPathFromToGrass`, `GrassCandidate` 타입 | ~400       |
| `svg/renderGridSvg.ts`    | `renderGridSvg`, `getCellCenterPx` — 위 모듈 import 후 시뮬레이션 루프 + SVG 조립만 유지                                                                                                                          | ~1,250     |

### 분리 시 주의사항

- `cellKey`, `edgeKeyAtTime`는 `reservationTable.ts`와 `planWindowed` 등에서 공용이므로 `reservationTable.ts`에서 export하고 나머지는 import해서 사용.
- `renderGridSvg` 내부의 클로저(예: `byKey`, `emptyCellSet`, `recomputeReachableEmptyFromGates`)는 그대로 두고, **순수 유틸만** 위 파일들로 옮기면 동작 변경 없이 분리 가능.

---

## 2. 시뮬레이션·렌더링 속도 개선 (기능 유지)

### 2-1. 시뮬레이션 루프 조기 종료 (권장, 적용함)

- **현재**: `maxSteps = 20000`까지 돌고, `remainingGrassKeys.size === 0`일 때만 `break`.
- **개선**:
  - 모든 양이 `mealsEaten[i] >= MAX_MEALS_PER_SHEEP`이면 즉시 `break`.
  - (선택) “아무도 이동할 계획이 없고, 남은 잔디도 없음”이면 `break` (이미 `remainingGrassKeys.size === 0`으로 비슷하게 처리됨).
- **효과**: 잔디가 적거나 양이 빨리 다 먹으면 루프를 수천~수만 틱 덜 돔.
- **기능**: 동작 동일 (이미 “다 먹으면” 의미상 끝난 상태).

### 2-2. needPlan 정렬 시 후보 캐시 (권장)

- **현재**: `needPlan.sort((a, b) => { ... })` 안에서 매 비교마다 `findNearestReachableGrassCandidates(a, ...)`와 `findNearestReachableGrassCandidates(b, ...)`를 호출 → O(n²) 번의 BFS/탐색.
- **개선**: 정렬 전에 `needPlan` 각 `i`에 대해 `findNearestReachableGrassCandidates(i, ...)`를 **한 번씩만** 호출해 `dist[i]` 등으로 캐시하고, `sort`에서는 `dist[a]`, `dist[b]`만 비교.
- **효과**: 틱당 경로 탐색 호출 수 대폭 감소.
- **기능**: 정렬 결과만 동일하게 유지하면 동작 동일.

### 2-3. “가다가 재평가” 구간에서 후보 호출 줄이기

- **현재**: “가는 길 재평가”에서 양마다 `findNearestReachableGrassCandidates`를 호출해 목표를 다시 정함.
- **개선**:
  - “옆에 잔디 있으면 바로 먹기”에서 이미 목표를 잡은 양은 재평가 생략.
  - 또는 재평가를 매 틱이 아니라 N틱마다만 수행 (N=2~3).
- **기능**: N틱마다 하면 동작이 아주 살짝 달라질 수 있으므로, 우선 2-1·2-2만 적용해도 효과 큼.

### 2-4. BFS/빈 칸 재계산 최소화

- **현재**: `emptyDirty`일 때마다 `recomputeReachableEmptyFromGates()`로 전체 BFS.
- **개선**: “이번 틱에 count가 0이 된 칸”만 알면, 그 칸과 인접한 칸만 큐에 넣어서 **증분형**으로 빈 칸 집합 갱신 (구현 난이도는 있음).  
  당장은 2-1·2-2만 해도 효과가 큼.

### 2-5. SVG 문자열 생성

- **현재**: `rects`, `fencePieces`, `keyframeEntries` 등은 이미 `array.push` 후 `join` 사용.
- **개선**: 최종 SVG를 한 번에 만들 때 `['<?xml...', fenceRects, rects, ...].join('')`처럼 배열로 모아서 `join` 한 번만 하면, 매우 큰 SVG에서 문자열 연산 비용을 조금 줄일 수 있음 (이미 대부분 배열 사용 중이면 이득 제한적).

### 2-6. maxSteps 상한 (선택)

- **현재**: `maxSteps = 20000`.
- **개선**: 그리드 크기·양 수에 비해 “실제로 필요한 최대 틱”이 작다면, 상한을 5,000~10,000으로 낮춰서 극단적인 경우만 막을 수 있음.  
  조기 종료(2-1)를 넣으면 대부분 그 전에 끝나므로, 2-1 적용 후 측정해 보면서 결정해도 됨

---

## 3. 적용 우선순위 요약

| 순서 | 항목                                                                                           | 난이도  | 기대 효과       | 기능 변경            |
| ---- | ---------------------------------------------------------------------------------------------- | ------- | --------------- | -------------------- |
| 1    | 시뮬레이션 조기 종료 (모든 양 식사 완료 시 break)                                              | 낮음    | 높음            | 없음                 |
| 2    | needPlan 정렬 시 후보 캐시                                                                     | 중간    | 높음            | 없음                 |
| 3    | 파일 분리 (constants → reservation → contribution → pathUtils → grassPlanning → renderGridSvg) | 중간    | 가독성·유지보수 | 없음 (import만 추가) |
| 4    | 재평가 호출 줄이기 / 증분 BFS                                                                  | 중~높음 | 중간            | 없음 또는 미미       |

우선 **1번 조기 종료**를 적용했고, 원하면 **2번 캐시**와 **3번 파일 분리**를 단계적으로 진행하면 됩니다.
