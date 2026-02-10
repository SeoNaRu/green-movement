# SVG 렌더링 코드 구조 (renderGridSvg)

어느 코드에 어떤 역할이 있는지 정리한 문서. 새 기능 추가 시 여기서 위치를 확인한 뒤 해당 섹션에 넣는다.

---

## 1. 진입점·공통

| 위치                | 파일                                       | 역할                                                              |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| 그리드 → SVG 문자열 | `renderGridSvg.ts` → `renderGridSvg(grid)` | 전체 오케스트레이션. 빈 그리드면 빈 SVG 반환.                     |
| 셀 좌표 → 픽셀      | `gridLayout.ts` → `getCellCenterPx()`      | (col, row) → 그리드 내 픽셀 정중앙. 양·UFO·잔디 위치 계산에 사용. |
| 상수                | `constants.ts`                             | CELL*SIZE, GAP, SHEEP*_, UFO\__, COLORS, FENCE\_\* 등.            |

---

## 2. 그리드 레이아웃·울타리

| 넣을 내용                                                                        | 파일                                   | 비고                                      |
| -------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| 그리드 크기 계산 (maxX, maxY, gridWidth, gridHeight)                             | `renderGridSvg.ts`                     | `renderGridSvg()` 초반.                   |
| 그리드·울타리 좌표 (gridLeftX, gridTopY, fenceRightX, totalWidth, baseHeight 등) | `renderGridSvg.ts`                     | FENCE_MARGIN 기준.                        |
| **울타리 SVG 조각 생성**                                                         | `gridLayout.ts` → `buildFencePieces()` | 입구 구간 제외한 상·하·좌·우 펜스 + 코너. |

---

## 3. UFO 드롭 준비 (스폰 위치·경로)

| 넣을 내용                          | 파일               | 비고                                                                                                |
| ---------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| 빈칸 BFS (잔디와 인접한 빈칸 시드) | `renderGridSvg.ts` | `recomputeReachableEmptyFromSeeds()`, `emptyBfsFromSeeds` 사용.                                     |
| 스폰 위치 목록                     | `renderGridSvg.ts` | `funnelPositionsEarly`: 셔플된 빈칸 중 sheepCount개.                                                |
| 스폰 틱·타이밍 상수                | `renderGridSvg.ts` | `spawnTick[]`, `DROP_TICKS`, `LIGHT_RAMP_S`, `SHEEP_FADE_S`, `DROP_STAY_S`.                         |
| 양별 목표 잔디·경로                | `renderGridSvg.ts` | `sheepTargetsWithEmpty`, `paths` (스폰 → 첫 잔디). `buildPathFromToGrass`, `pathBetweenCells` 사용. |
| 경로 유틸                          | `pathUtils.ts`     | `pathBetweenCells`, `emptyBfsFromSeeds`, `buildPathFromToGrass` 호출부는 renderGridSvg.             |

---

## 4. 시뮬레이션 루프 (양 이동·잔디 먹기)

| 넣을 내용                             | 파일               | 비고                                                                         |
| ------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| 예약 테이블·접근 예약                 | `renderGridSvg.ts` | `resTable`, `reservedApproach`. `reservationTable.js` 사용.                  |
| 양 상태 (위치, plan, goalGrassKey 등) | `renderGridSvg.ts` | `sheepStates[]`, 매 틱 갱신.                                                 |
| **메인 틱 루프**                      | `renderGridSvg.ts` | `for (let t = 0; t < maxSteps; t++)`. 점유 예약, 경로 계획, 이동, 잔디 먹기. |
| 윈도우 플래너 (BFS + 예약)            | `renderGridSvg.ts` | `planWindowed()`. 다음 몇 칸만 예약해 경로 찾기.                             |
| 잔디 후보 찾기·배정                   | `renderGridSvg.ts` | `findNearestReachableGrassCandidates`, `pickBestGrassCandidate`.             |
| positionsHistory 기록                 | `renderGridSvg.ts` | 매 틱 각 양의 (col, row) 푸시. 이후 애니메이션·잔디 페이드에 사용.           |

시뮬레이션 관련 **새 규칙**(예: 예약 조건, 이동 우선순위)은 이 섹션에 넣는다.

---

## 5. 시뮬레이션 이후 · 애니메이션 입력 데이터

| 넣을 내용                      | 파일               | 비고                                                                                  |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------- |
| 양 충돌 검사 (같은 틱 같은 칸) | `renderGridSvg.ts` | positionsHistory 기반. 디버그 로그용.                                                 |
| **잔디 셀별 도착 시각**        | `renderGridSvg.ts` | `targetCellArrivals`, `pushArrival()`. 양이 잔디 칸에 들어온 시점 + DROP_STAY_S 반영. |
| **전체 애니메이션 길이**       | `renderGridSvg.ts` | `maxTotalTime`. 스폰 오프셋·DROP_STAY_S 포함해 계산.                                  |

---

## 6. SVG 레이어 생성 (잔디·UFO·빛·양·최종 조립)

| 넣을 내용                | 파일               | 비고                                                                                                               |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **잔디 rect + 키프레임** | `renderGridSvg.ts` | `grassLoopKeyframes`, `rects`. targetCellArrivals 기준으로 fade 시점 계산.                                         |
| **UFO 키프레임**         | `renderGridSvg.ts` | `ufoKeyframePcts`, `ufo-drop`. 빈칸 도착 → DROP_STAY_S 정지 → 다음 빈칸.                                           |
| **빛 키프레임**          | `renderGridSvg.ts` | `ufo-light`. 0 → 0.1 (LIGHT_RAMP_S) → 유지 → 0 (DROP_STAY_S).                                                      |
| **양 키프레임**          | `renderGridSvg.ts` | `sheepAnimations`. 0% 투명 → 페이드인 완료 → DROP_STAY_S까지 대기 → 이동(오프셋 적용).                             |
| **최종 SVG 문자열 조립** | `renderGridSvg.ts` | `<defs><style>...</style></defs>` + 배경 + fenceRects + rects + queueRects + sheepGroups + ufoGroupStr + dotRects. |

레이어 순서: 배경 → 울타리 → 잔디 rect → 대기 칸 rect → 양 그룹 → UFO 그룹 → 디버그 점.

---

## 7. 기타·공유

| 넣을 내용            | 파일                  | 비고                                                                     |
| -------------------- | --------------------- | ------------------------------------------------------------------------ |
| contribution 레벨·색 | `contribution.ts`     | `getContributionLevel`, `getColor`, `calculateQuartiles`.                |
| 예약 테이블 API      | `reservationTable.js` | `createReservationTable`, `reserveCell`, `reserveEdge`, `isCellFree` 등. |
| 디버그 점            | `renderGridSvg.ts`    | `CELL_DOTS` (빈 배열이면 점 없음).                                       |

---

## 새 기능 넣을 때 체크리스트

- **레이아웃/울타리 변경** → `gridLayout.ts` 또는 `renderGridSvg.ts` 2번 섹션.
- **UFO/스폰 위치·타이밍** → `renderGridSvg.ts` 3번 섹션.
- **양 이동/잔디 먹는 로직** → `renderGridSvg.ts` 4번 섹션.
- **잔디가 사라지는 시점** → 5번(도착 시각) + 6번(잔디 키프레임).
- **UFO/빛/양 애니메이션 연출** → `renderGridSvg.ts` 6번 섹션.
- **상수 추가** → `constants.ts`.
