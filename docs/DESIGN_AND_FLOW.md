# green-movement 설계 및 데이터 흐름

이 문서는 현재 코드베이스가 어떻게 설계되어 있고, 데이터가 어떤 순서로 흐르는지 정확히 정리한 것이다.

---

## 1. 프로젝트 개요

- **목적**: GitHub 기여 그리드(잔디)를 “목장 + 양” 비주얼로 SVG 한 장에 렌더한다.
- **진입점**: `src/index.ts`
  - `fetchContributionGrid(username)` → GitHub API로 기여 주차별 데이터(2D) 획득
  - `mapGrid(weeks)` → 2D를 `GridCell[]` 플랫 배열로 변환 (x=주 인덱스, y=요일 0~6, count=기여 수)
  - `renderGridSvg(grid)` → 그리드 + 울타리 + 대기줄(깔때기) + 양 시뮬레이션 결과를 담은 SVG 문자열 반환
  - 반환된 SVG를 `assets/live.svg`에 저장

---

## 2. 전체 데이터 흐름 (파일 단위)

```
index.ts
  → fetchContributionGrid()   [github/fetchGrid.ts]  : weeks (2D)
  → mapGrid(weeks)            [grid/mapGrid.ts]      : grid (GridCell[])
  → renderGridSvg(grid)       [svg/renderGridSvg.ts]: SVG string
  → writeFileSync(OUT_PATH, svg)
```

- **GridCell**: `{ x, y, count, date }`. `count > 0` = 잔디(초록), `count === 0` = 빈 칸(길).
- **renderGridSvg** 안에서만 시뮬레이션(틱 루프)이 돌고, 그 결과로 양 위치 타임라인·잔디 페이드 시점이 정해진 뒤 SVG가 조립된다.

---

## 3. renderGridSvg 내부 설계

`renderGridSvg(grid)`는 **한 번 호출되면** 그리드 크기·게이트·깔때기·양 수·경로·틱 루프·렌더까지 **전부 한 함수 안에서** 순서대로 실행된다. (외부에 상태를 두지 않음.)

### 3.1 좌표계와 상수

- **그리드**: `col` = x (0 ~ maxX), `row` = y (0 ~ maxY). 픽셀은 `gridLeftX + col*(CELL_SIZE+GAP)` 등.
- **대기줄(깔때기)**: 그리드 **위쪽** 가상 영역. `row`가 **음수** (예: -1, -2, -3 …). `row = -1`이 게이트 바로 위, 숫자가 작아질수록 위로 올라감.
- **게이트**: 그리드 최상단 row=0의 두 칸. `(centerCol-1, 0)` 왼쪽 입구, `(centerCol, 0)` 오른쪽 입구. 두 칸은 초기부터 `count=0`(길)로 고정.
- **상수**: `SHEEP_CELL_TIME`(1칸당 초), `waitTicks`, `MAX_MEALS_PER_SHEEP`, `STUCK_BACKOFF_THRESHOLD`, `APPROACH_TTL`, `APPROACH_STEAL_*` 등은 모두 `renderGridSvg.ts` 상단에 정의.

### 3.2 1단계: 그리드·게이트·BFS

1. **maxX, maxY**: grid에서 x, y 최댓값.
2. **centerCol**: `floor(maxX/2)`. 게이트는 `centerCol-1`, `centerCol` 두 칸.
3. **게이트 칸 비우기**: `(centerCol-1,0)`, `(centerCol,0)`를 `byKey`와 `initialCountByKey`에서 count=0으로 설정. (이후 `grid` 셀의 `count`는 시뮬레이션 중 “먹힌” 잔디에 대해 0으로 바뀜.)
4. **입구별 BFS** (두 번):
   - `emptyBfsFromGate(grid, maxX, maxY, centerCol-1)` → leftBfs
   - `emptyBfsFromGate(grid, maxX, maxY, centerCol)` → rightBfs
   - 각 BFS: 해당 입구 칸(이미 count=0)에서 시작해, **count===0인 칸만** 4방향으로 확장. 결과로 `emptyOrder`(빈 칸 순서), `parent`(경로 복원용 맵).
5. **잔디 목표 후보**:
   - `buildGrassTargets(leftBfs.emptyOrder, centerCol-1)` → grassTargetsLeft
   - `buildGrassTargets(rightBfs.emptyOrder, centerCol)` → grassTargetsRight
   - 각 “빈 칸”에 4방 인접한 “잔디(count>0) 칸”을 (grass, emptyNeighbor, gateCol) 형태로 리스트에 넣음.
6. **양 수**: `sheepCount = min(grassCells.length/3, grassTargetsLeft.length + grassTargetsRight.length)`.

### 3.3 2단계: 깔때기(funnel)와 스폰·잔디 배정

1. **generateFunnel(sheepCount, centerCol, maxX)**:
   - **funnelAreaSet**: row=-1은 게이트 2칸, row=-2는 그 위 버퍼(폭 더 넓음), row=-3 이하는 삼각형으로 넓어지는 영역. 모든 칸을 Set으로 보관.
   - **spawnPositions**: 위 영역 안에서 양 한 마리당 [col, row] 한 칸씩 배정. (깔때기 “순서”는 row가 큰 쪽·게이트에 가까운 col이 우선.)
   - **minRow**: 깔때기 최상단 row (가장 작은 음수).
2. **queueOrderEarly**: 양 인덱스를 “입구에 가까운 순”으로 정렬 (row 내림차순, 같은 row면 게이트 위 col 우선).
3. **sheepTargetsWithEmpty**: queueOrderEarly 순서대로, “왼쪽 입구 선호” vs “오른쪽 입구 선호”에 따라 grassTargetsLeft/Right에서 **한 번도 안 배정된 잔디**를 pickFirstFree로 하나씩 배정. 결과는 (grass, emptyNeighbor, gateCol) per sheep.
4. **validIndices**: sheepTargetsWithEmpty[i]가 존재하는 i만. (배정 실패한 양은 제외.)
5. **funnelPositions**: validIndices에 대해 funnelPositionsEarly[i]만 모은 배열.
6. **gateColMin, gateColMax**: centerCol-1, centerCol.

### 3.4 3단계: 경로 생성 (fullPaths)

각 양 i에 대해:

1. **paths[i]**: “게이트에서 첫 잔디까지” 경로.
   - sheepTargetsWithEmpty[i]의 emptyNeighbor → gate 쪽 BFS parent로 tracePath → 잔디 칸 한 칸 추가.
   - gateCol에 따라 leftBfs.parent 또는 rightBfs.parent 사용.
2. **funnelToGate(funnel[0], funnel[1])**: 스폰 칸 [col, row]에서 게이트(0행)까지의 경로.
   - row가 -2보다 작으면 “다음 줄 허용 col 범위”로 먼저 가로 이동한 뒤 한 칸 위로, 반복.
   - row=-2에서 게이트 col로 수평 정렬 후 row=-1, 그 다음 [c,0] 진입.
3. **raw**: `toGate` + `gateToTarget`(paths[i]) 를 이어 붙인 경로.
4. **ensureOnly4Direction(raw)**: 대각선 구간을 한 칸씩 쪼개서 4방향만 남김.
5. **validSet**: funnelCellSet ∪ emptyCellSet ∪ 게이트 두 칸 키 ∪ 첫 잔디 칸 키.
6. **trimPathToValidOnly(p, validSet)**: 경로를 validSet에 있는 칸만 남기고, 처음으로 invalid 나오면 그 전까지만 자름.
7. **addCornerPause**: 방향이 바뀌는 칸에서 한 틱 멈추도록 칸 한 번 더 추가.
8. **route**: 위 경로 + 첫 잔디 칸을 waitTicks번 반복 (잔디 “먹는 대기”).
9. **fullPaths[i] = route**. (이후 틱 루프에서 route 끝에 “다음 잔디로 가는 경로 + 대기”가 append됨.)

그리고:

- **remainingGrassKeys**: emptyCellSet에 4방 인접한 “원래 잔디였던 칸(initial>0)”만 모은 Set. 도달 가능한 잔디만 포함.
- **refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys)**: emptyCellSet 각 칸의 4방 중 “아직 잔디인 칸”을 remainingGrassKeys에 보충. (잔디를 먹어 빈칸이 늘어날 때마다 나중에 호출.)
- **reservedGrass, reservedBySheep, reservedAtTick**: 잔디 칸별/양별 예약. (grassKey → sheepIndex, sheepIndex → grassKey, 예약한 틱.)
- **reservedApproach, reservedApproachBySheep**: “접근 칸”(잔디 바로 옆 빈 칸) 예약. ApproachRes = { owner, tick, dist }. TTL·뺏기(steal) 로직에 사용.
- **queueOrder**: validIndices를 “깔때기 순서”(입구 가까운 순)로 정렬한 뒤, 원래 validIndices에서의 인덱스로 매핑.  
  → 틱 루프에서 “이동 시도 순서”로 사용.
- **priority**: queueOrder의 역매핑 (양 i가 몇 번째 순서인지).
- **indicesNow, positionsHistory, stuckTicks, mealsEaten, backoffCooldown**: 틱마다 갱신되는 상태.

### 3.5 4단계: 틱 루프 (핵심 시뮬레이션)

`for (let t = 0; t < maxSteps; t++)` 안에서 다음이 **매 틱** 순서대로 실행된다.

#### 4.5.1 틱 시작 정리

- **indicesNow**를 각 경로 길이 안으로 클램프.
- **currentPos[i]**: fullPaths[i]indicesNow[i]] (현재 위치).
- **occupiedNowMap**: (cellKey → sheepIndex). “현재 틱 시작 시점에 누가 어디에 있는지.”

#### 4.5.2 예약 해제 (TTL)

- **잔디 예약 TTL**: reservedAtTick가 100틱 넘게 지났으면 해당 잔디 예약 해제, reservedApproach도 해제, fullPaths[i]를 현재 위치 이후로 자름.
- **접근칸 예약 TTL**: reservedApproach에서 tick이 APPROACH_TTL 넘은 것은 삭제, reservedApproachBySheep 정리.

#### 4.5.3 “다음 목표가 필요한 양” 판정 및 배정

- **need**:
  - mealsEaten[i] < MAX_MEALS_PER_SHEEP 이고,
  - remainingGrassKeys가 비어 있지 않고,
  - “지금 잔디 위에서 waitTicks만큼 대기 끝났음” 또는 “경로 끝인데 잔디 위가 아님(멈춤)”  
    → i를 need에 넣음.
- **availableKeys**: remainingGrassKeys에서 이미 reservedGrass에 있는 칸 제거.
- **needByPriority**: need를 priority 순으로 정렬.
- needByPriority 순서대로:
  - **findNearestReachableGrassCandidates**(i, pos, availableKeys, emptyCellSet, funnelCellSet, minFunnelRow, …):  
    현재 위치에서 BFS. 확장 가능 칸 = emptyCellSet ∪ funnelCellSet. 인접한 “가용 잔디”를 접근 칸(emptyNeighbor)과 함께 후보로 수집.  
    다른 양이 점유한 칸·다른 양이 예약한 접근 칸은 제외(selfIndex는 허용).  
    접근칸 예약이 있으면 “오래됐고 + 더 가까우면” 뺏기(steal) 후 이 양이 예약.
  - 후보 중 하나를 골라:
    - **buildPathFromToGrass**(pos, emptyNeighbor, grass, emptyCellSet, …) 로 경로 생성.
    - fullPaths[i] 끝에 “해당 경로 + 잔디 칸 waitTicks번” append.
    - reservedGrass, reservedBySheep, reservedAtTick, reservedApproach, reservedApproachBySheep, mealsEaten 갱신.
    - availableKeys에서 해당 잔디 제거.

#### 4.5.4 위치 기록 및 이동 시도

- **positionsHistory[i].push(currentPos[i])**.
- **allAtEnd**면 틱 루프 break.
- **occupiedNext, occupiedEdge, nextIndices** 초기화.
- **queueOrder** 순서대로 각 양 i에 대해:
  - path = fullPaths[i], currIdx = indicesNow[i], targetIdx = currIdx+1 (또는 끝이면 currIdx), target = path[targetIdx].
  - **backoffCooldown[i] > 0**이면 이번 틱은 이동 안 함, nextIndices[i]=currIdx, occupiedNext에 현재 칸만 넣고 continue.
  - **이동 시도 (targetIdx !== currIdx)**:
    - **blocked** 판정:
      - 4방향 아님 → invalidMove.
      - target이 게이트 칸이면 “이번 틱 게이트 승자”만 허용 (pickGateWinners 등; 현재 버전에 따라 게이트 단일 서버/순번제일 수 있음).
      - target에 다른 양이 이미 있음 → occupiedNow.
      - occupiedNext에 target이 있음 → occupiedNext.
      - (curr→target) 반대 엣지가 이미 occupiedEdge에 있음 → edgeSwap.
    - blocked면 stuckTicks[i] 증가.
      - stuckTicks가 3 이상이면: 예약 전부 해제, fullPaths[i]를 currIdx+1로 자름, target=curr, backoffCooldown 설정.
      - 아니면 occupiedNow/occupiedNext일 때 STUCK_BACKOFF_THRESHOLD 이상이면 “한 칸 후진” 시도( findPrevDifferentIdx ); 후진 칸이 비어 있으면 target을 그 칸으로, backoffCooldown 설정.
      - 그 외에는 target=curr (제자리).
    - blocked 아니면 stuckTicks[i]=0.
  - **nextIndices[i] = targetIdx**. (실제로 이동한 인덱스.)
  - **moved = (targetIdx !== currIdx)**.
    - moved이면: 접근칸 예약 도착 시 해제, occupiedEdge에 (curr→target) 추가, target이 잔디(count>0)면 먹기 처리(count=0, emptyDirty, remainingGrassKeys 삭제, reservedGrass/BySheep/AtTick, reservedApproach/BySheep 정리).
  - **occupiedNext.set(targetKey, i)**.
- **emptyDirty**이면 emptyCellSet = recomputeReachableEmptyFromGates(), refreshReachableGrassKeys(emptyCellSet, remainingGrassKeys).
- **indicesNow = nextIndices**.

이렇게 한 틱이 끝나고, 다음 틱에서 다시 currentPos·occupiedNowMap 계산부터 반복된다.

### 3.6 5단계: 렌더 (SVG 조립)

틱 루프가 끝난 뒤:

1. **positionsHistory**: 양별로 [틱0 위치, 틱1 위치, …].  
   잔디 칸에 “처음 도착한” 틱을 찾아 **targetCellArrivals**에 (arrivalTime, level, sheepIndex) 기록.
2. **그리드 rect**: 각 셀에 대해, targetCellArrivals가 있으면 첫 도착 시점부터 잔디 페이드 애니메이션(LEVEL 4→0) CSS 적용. 없으면 quartile 기반 level로 색만.
3. **양 애니메이션**: positionsHistory를 퍼센트 키프레임으로 변환. 각 키프레임에서 셀 중심 좌표·회전각(이동 방향). steps(segment수, end) 로 부드럽지 않게 이동.
4. **queueRects**: funnelAreaSet 전체를 TILE_PATH 색 rect로 (대기줄 길).
5. **viewBox**: 위쪽으로 queueHeight만큼 넓혀서 대기줄이 보이도록.
6. **최종 SVG**: defs(style), 배경 rect, fenceRects, rects(그리드), queueRects, sheepGroups, dotRects 순으로 문자열 조립해 반환.

---

## 4. 핵심 자료 구조 요약

| 이름                                                     | 의미                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| grid / byKey                                             | GridCell[] 및 key→cell 맵. 시뮬 중 cell.count가 0으로 바뀜.                                 |
| initialCountByKey                                        | 초기 count 백업 (잔디 레벨·도달 가능 판단용).                                               |
| leftBfs / rightBfs                                       | 게이트별 BFS 결과 (emptyOrder, parent).                                                     |
| funnelAreaSet, funnelPositionsEarly, minFunnelRow        | 깔때기 영역·스폰 칸·최상단 row.                                                             |
| sheepTargetsWithEmpty, sheepTargets, paths               | 양별 (첫 잔디, 접근 빈칸, gateCol), 잔디만 배열, 게이트→첫 잔디 경로.                       |
| fullPaths[i]                                             | 양 i의 전체 경로 (스폰→게이트→첫 잔디→대기→…→다음 잔디들→대기…). 동적 append됨.             |
| indicesNow[i]                                            | 양 i가 fullPaths[i]의 몇 번째 칸에 있는지.                                                  |
| remainingGrassKeys                                       | 아직 “도달 가능”하다고 보는 잔디 칸 키 집합. 먹으면 삭제, refreshReachableGrassKeys로 보충. |
| reservedGrass / reservedBySheep / reservedAtTick         | 잔디 칸 예약(누가, 언제).                                                                   |
| reservedApproach / reservedApproachBySheep (ApproachRes) | 접근 칸 예약(owner, tick, dist). TTL·steal에 사용.                                          |
| queueOrder                                               | “이동 시도 순서” (입구 가까운 양 먼저).                                                     |
| priority                                                 | 양 i의 순서 번호 (0이 가장 앞).                                                             |
| positionsHistory[i]                                      | 양 i의 틱별 위치 [ [c,r], … ].                                                              |

---

## 5. 알고리즘 요약

- **emptyBfsFromGate**: 한 입구 (startCol,0)에서 count===0인 칸만 4방향 BFS. emptyOrder + parent.
- **buildGrassTargets**: emptyOrder의 각 칸에 4방 인접한 “잔디”를 (grass, emptyNeighbor, gateCol)로 수집.
- **generateFunnel**: row=-1,-2 버퍼 + row≤-3 삼각형 영역을 funnelAreaSet에, 스폰 칸을 spawnPositions에.
- **funnelToGate**: 스폰 [col,row]에서 “다음 줄 허용 범위”를 지키며 위로 이동한 뒤 게이트 col로 맞추고 [c,0] 진입.
- **findNearestReachableGrassCandidates**: 현재 위치 BFS. 확장=emptyCellSet∪funnelCellSet. 인접 잔디를 접근 칸과 함께 수집. 다른 양 점유/예약은 selfIndex만 허용. TTL·steal은 호출부에서 처리.
- **buildPathFromToGrass**: from → emptyNeighbor → targetGrass 를 allowedSet(emptyCellSet+시작+접근+잔디) 안에서 pathBetweenCells로 구한 뒤 4방·코너 pause 적용.
- **recomputeReachableEmptyFromGates**: 게이트 두 칸에서 count===0인 칸만 4방 BFS. 빈 칸 Set 반환.
- **refreshReachableGrassKeys**: emptyCellSet 각 칸 4방 중 “원래 잔디이고 아직 count>0”인 칸을 remainingGrassKeys에 추가.
- **trimPathToValidOnly**: path를 validSet에 있는 칸만 남기고, 처음 invalid에서 끊음.
- **이동 블로킹**: 4방 아님 / 게이트 진입 권한 없음 / occupiedNow / occupiedNext / edgeSwap → blocked. blocked 시 후진·경로 자르기·backoff 등으로 처리.

---

## 6. 제어 흐름 요약 (renderGridSvg 한 번 호출 시)

1. 그리드 크기·게이트 고정·입구 BFS·잔디 후보 리스트.
2. 깔때기 생성·스폰·queueOrderEarly·잔디 1:1 배정(sheepTargetsWithEmpty)·validIndices.
3. 펜스 조각 생성·paths(게이트→첫 잔디)·funnelToGate·fullPaths 생성(trim·validSet·waitAtFirst 포함)·remainingGrassKeys·예약 구조·queueOrder·priority·틱용 상태 초기화.
4. **틱 루프**: 예약 TTL → need 판정·후보 탐색·경로 append → positionsHistory 기록 → queueOrder 순 이동 시도(blocked·게이트·먹기·emptyDirty·refresh) → indicesNow 갱신. allAtEnd까지 반복.
5. **렌더**: targetCellArrivals·그리드 rect·양 키프레임·queueRects·viewBox·SVG 문자열 반환.

이 한 파일(`DESIGN_AND_FLOW.md`)만 따라가면 현재 코드가 “어디서 무엇을, 어떤 순서로” 하는지 정확히 대응할 수 있다.
