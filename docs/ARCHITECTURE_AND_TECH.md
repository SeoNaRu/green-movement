# 아키텍처·디자인 패턴·기술·알고리즘 정리

## 1. 아키텍처

### 1.1 전체 스타일

- **파이프라인 + 레이어 분리** (가벼운 계층화)
- MVC/Redux/이벤트 버스 없음. **단방향 데이터 흐름**: Grid → Context → Plan → Sim → Timeline → SVG Layers → 최종 SVG 문자열
- **결정론적 시뮬레이션**: 같은 그리드 입력이면 항상 동일한 SVG 문자열 생성 (실시간 UI/웹소켓 없음)

### 1.2 레이어 구성

| 레이어         | 디렉터리      | 역할                                                        |
| -------------- | ------------- | ----------------------------------------------------------- |
| **도메인**     | `domain/`     | 양·UFO 상태/단계 정의 (FSM enum, SheepState 타입)           |
| **플래닝**     | `planning/`   | 타겟 선택(잔디·빈칸 배정), 경로 입력 생성                   |
| **시뮬레이션** | `simulation/` | 틱 기반 시뮬 re-export (`svg/sim/` 구현)                    |
| **타임라인**   | `timeline/`   | 시뮬 결과 → 초 단위 스케줄(UFO 도착/퇴장, 픽업 등)          |
| **SVG**        | `svg/`        | 컨텍스트 빌드, 레이아웃, 레이어(잔디/UFO/양), 컴포즈        |
| **설정**       | `config/`     | 상수, 타이밍 프리셋                                         |
| **진입·앱**    | 루트 `src/`   | `index.ts`, `renderGridSvg.ts` 파사드, `app/generateSvg.ts` |

### 1.3 파이프라인 흐름

```
Grid (GitHub contribution 셀 배열)
  → buildContext(grid)        [svg/buildContext.ts]  레이아웃·맵·사분위수
  → planTargets(ctx)           [planning/targetPlanner.ts]  양 수·타겟·경로·초기 상태
  → simulateGrid(...)         [simulation → svg/sim/simulate.ts]  틱 루프
  → buildTimeline(ctx, plan, sim)  [timeline/schedules.ts]  초 단위 스케줄
  → buildGrassLayer / buildUfoLayer / buildSheepLayer  [svg/layers/*]
  → composeSvg(...)           [svg/render/composeSvg.ts]
  → SVG 문자열 (파일로 저장 또는 프로필 README용)
```

---

## 2. 디자인 패턴

### 2.1 패턴 목록 및 적용 위치

| 패턴                               | 설명                                              | 적용 위치                                                                                                 |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **파이프라인 (Pipeline)**          | 단계별로 데이터를 넘기며 최종 결과 생성           | `svg/renderGridSvg.ts`: buildContext → planTargets → simulateGrid → buildTimeline → 레이어 → composeSvg   |
| **파사드 (Facade)**                | 복잡한 서브시스템을 하나의 진입점으로 감춤        | `src/renderGridSvg.ts` → `src/svg/renderGridSvg.ts`만 호출                                                |
| **전략 (Strategy)**                | 알고리즘(타겟 선택·타이밍)을 교체 가능하게        | `TargetStrategy` in `planning/targetPlanner.ts`, `TimingPolicy` in `timeline/schedules.ts` (policy 인자)  |
| **상태 머신 (FSM)**                | 양·UFO 단계를 명시적으로 구분                     | `domain/sheep.ts` (SheepPhase), `domain/ufo.ts` (UfoPhase). 시뮬/타임라인 로직은 동일, 타입으로 의미 부여 |
| **컨텍스트 객체 (Context Object)** | 한 단계에서 쓰는 데이터를 한 덩어리로 전달        | `GridContext` (buildContext 반환), `PlanResult`, `TimelineResult`                                         |
| **Re-export**                      | 구현은 한 곳에 두고 다른 레이어에서 동일 API 노출 | `simulation/simulate.ts` → `svg/sim/simulate.ts`, `svg/layers/*` → `svg/anim/keyframes.ts`                |

### 2.2 패턴별 상세

- **TargetStrategy**
  - 인터페이스: `planTargets(ctx: GridContext): PlanResult`
  - 기본 구현: 잔디와 인접한 빈칸을 시드로 BFS → 연결된 빈칸 순서 → (잔디, 빈칸) 쌍 생성 → 양당 하나씩 배정 (빈칸 중복 최소화)
  - `planTargets(ctx, strategy?)` 로 다른 전략 주입 가능 (현재 퍼블릭 API에는 미연결)

- **TimingPolicy**
  - `buildTimeline(ctx, plan, sim, policy?)` 에 `Partial<TimingPolicy>` 전달 가능
  - `config/presets.ts` 의 default / fast / cinematic 이 여기 대응

- **FSM**
  - Sheep: SPAWNED → DROPPED → MOVING → EATING → WAITING → PICKED_UP
  - UFO: ENTER → MOVE → BEAM_ON → DROP → BEAM_OFF → LEAVE
  - 시뮬 내부는 기존 `SheepState` (pos, plan, goalGrassKey, eatUntil, stuck, eatingGrassKey) 유지; Phase enum은 문서/확장용

---

## 3. 사용 기술

| 분류            | 기술                     | 용도                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------ |
| **언어·런타임** | TypeScript 5.x           | 정적 타입, ESM 모듈                                          |
|                 | Node.js 18+              | 빌드·실행 환경                                               |
| **모듈**        | ESM (`"type": "module"`) | import/export, `.js` 확장자 사용                             |
| **출력**        | SVG 1.1                  | 뷰박스·rect·g·path, CSS `@keyframes` 로 애니메이션           |
| **외부 API**    | GitHub GraphQL API       | contribution 그리드 조회 (`github/fetchGrid.ts`, `query.ts`) |
| **설정**        | dotenv                   | `.env` 로 `GITHUB_TOKEN`, `GITHUB_USERNAME` 로드             |

---

## 4. 기술·패턴 적용 위치 요약표

| 적용 대상       | 기술/패턴                  | 파일/위치                                                    |
| --------------- | -------------------------- | ------------------------------------------------------------ |
| 진입점          | 파사드                     | `src/renderGridSvg.ts`                                       |
| 오케스트레이션  | 파이프라인                 | `src/svg/renderGridSvg.ts`                                   |
| 그리드·레이아웃 | 컨텍스트 객체              | `svg/buildContext.ts` (GridContext)                          |
| 타겟·경로       | 전략 패턴                  | `planning/targetPlanner.ts` (TargetStrategy, planTargets)    |
| 시뮬 실행       | Re-export                  | `simulation/simulate.ts` → `svg/sim/simulate.ts`             |
| 타임라인        | 전략(정책)                 | `timeline/schedules.ts` (TimingPolicy, buildTimeline)        |
| 양·UFO 단계     | FSM                        | `domain/sheep.ts`, `domain/ufo.ts`                           |
| 레이어 조립     | Re-export + 컴포지션       | `svg/layers/*` → `anim/keyframes.ts`, `render/composeSvg.ts` |
| 타이밍 프리셋   | 설정 객체                  | `config/presets.ts`                                          |
| 빈칸/경로 탐색  | BFS                        | `svg/pathUtils.ts`, `svg/simHelpers.ts`                      |
| 충돌 회피       | 예약 테이블 (시간·셀·엣지) | `svg/reservationTable.ts`, `svg/sim/simulate.ts`             |
| 잔디 색/레벨    | 사분위수                   | `svg/contribution.ts`, `config` 상수                         |

---

## 5. 알고리즘

### 5.1 빈칸 BFS (다중 시드)

- **목적**: 잔디와 인접한 빈칸을 시드로, “이동 가능한 빈칸” 전체를 한 번에 계산
- **위치**: `svg/pathUtils.ts` — `emptyBfsFromSeeds(grid, maxX, maxY, seeds)`
- **동작**:
  - 시드 칸들에서 동시에 BFS 시작 (4방향, 빈 칸만 통과)
  - `visited`, `parent`, `emptyOrder` 유지
  - 결과: 빈칸의 방문 순서 `emptyOrder` + parent 맵 (경로 복원용)
- **사용처**: 플래닝에서 “도달 가능 빈칸” 집합·순서, 시뮬에서 `recomputeReachableEmptyFromSeeds()` (매 틱 갱신 가능)

### 5.2 BFS 최단 경로 (두 칸 사이)

- **목적**: `allowedSet` 안의 칸만 사용해 from → to 최단 경로 (4방향)
- **위치**: `svg/pathUtils.ts` — `pathBetweenCells(fromCol, fromRow, toCol, toRow, allowedSet, maxX, maxY)`
- **동작**:
  - BFS로 from에서 확장, to 도달 시 종료
  - `tracePath(toCol, toRow, parent)` 로 parent 역추적해 경로 배열 생성
- **사용처**:
  - `pathBetweenGrassCells` (잔디↔잔디)
  - `simHelpers.buildPathFromToGrass`: [드롭 위치] → [빈칸 이웃] → [목표 잔디] 경로 (4방향 정규화·코너 퍼즈 적용)

### 5.3 사분위수(Quartile) 기반 잔디 레벨

- **목적**: GitHub contribution 그리드와 동일하게, 기여도 개수로 잔디 “레벨”(0~4) 부여
- **위치**: `svg/contribution.ts` — `calculateQuartiles(counts)`, `getContributionLevel(count, quartiles)`
- **동작**:
  - 0 제외한 count 배열 정렬 후 25%/50%/75% 위치 값으로 Q1, Q2, Q3 계산
  - count < Q1 → 1, < Q2 → 2, < Q3 → 3, else → 4
  - 레벨별 색은 `getColor(level)` (config 상수 COLORS)
- **사용처**: 잔디 rect 색, “먹힌 뒤” 페이드 시작 레벨

### 5.4 예약 테이블 (Reservation Table)

- **목적**: 여러 양이 같은 시간에 같은 셀/엣지를 쓰지 않도록 충돌 방지
- **위치**: `svg/reservationTable.ts` (cell·edge별 “틱 → 점유자”)
- **동작**:
  - `reserveCell(res, t, c, r, self)` / `reserveEdge(res, from, to, t, self)`
  - `isCellFree` / 엣지 점유 여부로 이동 가능 여부 판단
  - TTL/선점 규칙은 시뮬 쪽 상수(GRASS_RES_TTL, APPROACH_TTL 등)와 연동
- **사용처**: `svg/sim/simulate.ts` — `planWindowed` 등에서 앞으로 몇 틱까지 셀/엣지 예약 후 경로 계획

### 5.5 틱 기반 시뮬레이션

- **목적**: 매 틱마다 양 위치·목표·예약·잔디 카운트 갱신, “도착 시각” 수집
- **위치**: `svg/sim/simulate.ts` — `simulateGrid(...)`
- **동작**:
  - `spawnTick[i]` 에 따라 양 i가 해당 틱에 등장
  - 각 틱: 이동 필요 양은 `planWindowed` 등으로 경로 계획 → 예약 테이블과 비교 → 1칸 이동 또는 대기
  - 잔디 도착 시 eating 상태, `waitTicks` 후 카운트 감소·예약 해제
  - `remainingGrassKeys`, `emptyCellSet` 갱신, 조기 종료 조건 확인
- **출력**: `positionsHistory` (양별 위치 시계열), `targetCellArrivals` (셀별 도착 시각·레벨), `maxTotalTime`

### 5.6 타임라인 → 초(second) 스케줄

- **목적**: 시뮬 “틱”을 실제 초 단위로 바꾸고, UFO 진입/드롭/퇴장/픽업 시각 계산
- **위치**: `timeline/schedules.ts` — `buildTimeline(ctx, plan, sim, policy?)`
- **동작**:
  - `moveStartAbsS`, `visualSpawnAbsS`, `readyAbsS`, `ufoLeaveAbsS` 등 시뮬 결과와 타이밍 상수로 계산
  - UFO 픽업: “모든 양 멈춘 뒤” UFO가 마지막 드롭 위치에서 시작해 각 양 위치까지 셀 거리·UFO_CELL_TIME으로 이동 시간 누적
  - `timelineOffset = UFO_ENTRY_S` 로 전체 타임라인 시프트
- **사용처**: 레이어 빌더에 “몇 초에 무슨 일” 전달 → CSS keyframes 퍼센트로 변환

### 5.7 CSS 키프레임 기반 SVG 애니메이션

- **목적**: 재생 시간 `maxTotalTime` 초 동안 잔디 색 변화, UFO 이동/회전, 양 위치 변화를 SVG 안에서 재생
- **위치**: `svg/anim/keyframes.ts` (buildGrassLayer, buildUfoLayer, buildSheepLayer)
- **동작**:
  - 각 이벤트 시각을 `(time / maxTotalTime) * 100` 으로 퍼센트 변환
  - `@keyframes` 이름을 셀/양 인덱스로 구분해 중복 방지
  - `<rect>` / `<g>` 에 `animation: name maxTotalTimes linear 0s 1 both` 형태로 적용
- **사용처**: `composeSvg` 에서 스타일 블록 + rect/g 조합해 최종 SVG 문자열 생성

---

## 6. 참고 문서

- 파일 구조: [FILE_STRUCTURE.md](./FILE_STRUCTURE.md)
- 파이프라인·검증: [REFACTOR_PIPELINE.md](./REFACTOR_PIPELINE.md)
- SVG 렌더 구조: [SVG_RENDER_STRUCTURE.md](./SVG_RENDER_STRUCTURE.md)
