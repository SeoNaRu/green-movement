# 파이프라인 리팩터 정리 (3·4·5 적용)

## 1. 파이프라인 흐름

```
Input Grid
    → buildContext(grid)        [svg/buildContext.ts]
    → planTargets(ctx)          [planning/targetPlanner.ts]
    → simulateGrid(...)        [simulation/simulate.ts → svg/sim/simulate.ts]
    → buildTimeline(ctx, plan, sim)  [timeline/schedules.ts]
    → buildGrassLayer / buildUfoLayer / buildSheepLayer  [svg/layers/*]
    → composeSvg(...)           [svg/render/composeSvg.ts]
    → SVG 문자열
```

- **진입점**: `renderGridSvg(grid)` (`src/renderGridSvg.ts` → `src/svg/renderGridSvg.ts`)
- **역할**: 오케스트레이션만 수행하고, 비즈니스 로직은 각 레이어 모듈에 위임.

---

## 2. 폴더/파일 구조

| 경로                   | 역할                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| **domain/**            |                                                                       |
| `sheep.ts`             | `SheepPhase` enum, `SheepState` 타입                                  |
| `ufo.ts`               | `UfoPhase` enum                                                       |
| **planning/**          |                                                                       |
| `types.ts`             | `TargetWithGate`, `PlanResult`                                        |
| `targetPlanner.ts`     | `planTargets(ctx)`, `TargetStrategy` + 기본 구현(pickGrass)           |
| **simulation/**        |                                                                       |
| `simulate.ts`          | `simulateGrid`, `SimulationResult`, `Arrival`, `SheepState` re-export |
| **timeline/**          |                                                                       |
| `types.ts`             | `TimelineResult`                                                      |
| `schedules.ts`         | `buildTimeline(ctx, plan, sim, policy?)`, `TimingPolicy`              |
| **svg/**               |                                                                       |
| `buildContext.ts`      | `buildContext(grid)`, `GridContext`                                   |
| `layers/grassLayer.ts` | `buildGrassLayer` re-export                                           |
| `layers/ufoLayer.ts`   | `buildUfoLayer` re-export                                             |
| `layers/sheepLayer.ts` | `buildSheepLayer` re-export                                           |
| `renderGridSvg.ts`     | 파이프라인 호출만 (약 150줄)                                          |
| **config/**            |                                                                       |
| `constants.ts`         | 셀 크기, UFO/양 타이밍 등 상수                                        |
| `presets.ts`           | `PRESET_DEFAULT`, `PRESET_FAST`, `PRESET_CINEMATIC` (타이밍 프리셋)   |

---

## 3. FSM·전략

- **Sheep**: `SheepPhase` (SPAWNED → DROPPED → MOVING → EATING → WAITING → PICKED_UP). 시뮬은 기존 `SheepState` 유지.
- **UFO**: `UfoPhase` (ENTER → MOVE → BEAM_ON → DROP → BEAM_OFF → LEAVE).
- **TargetStrategy**: `planTargets(ctx)` 한 개 메서드. 기본은 “잔디 근처 빈칸 → BFS → 양당 (잔디, 빈칸) 배정”.
- **TimingPolicy**: `buildTimeline(..., policy?)`에 `Partial<TimingPolicy>` 전달 가능. `config/presets.ts`의 `PRESET_FAST`, `PRESET_CINEMATIC` 사용 가능 (현재 퍼블릭 API에는 미연결).

---

## 4. 검증 방법

### 빌드·생성

```bash
npm run build
npm run generate
```

- 성공 시 `assets/live.svg` 생성.

### 동일성 확인 (리팩터 전후)

1. **리팩터 전** SVG를 다른 이름으로 저장해 둔 경우:

   ```bash
   # 예: refactor_before.svg 저장 후
   diff assets/refactor_before.svg assets/live.svg
   ```

   - 동일하면 출력 없음.

2. **저장본이 없을 때**:
   - `npm run generate`를 두 번 실행한 뒤 두 결과를 비교하면, 결정론적이므로 동일해야 함.

   ```bash
   cp assets/live.svg assets/live_a.svg
   npm run generate
   diff assets/live_a.svg assets/live.svg
   ```

3. **디버그 로그** (선택):
   ```bash
   DEBUG_TIMING=1 npm run generate
   DEBUG_DROP=1  npm run generate
   DEBUG_SPEC=1  npm run generate
   ```

---

## 5. 타이밍 프리셋 사용 (향후 API 확장 시)

`renderGridSvg(grid, options?)` 형태로 옵션을 받을 때 예시:

```ts
import { buildContext } from "./svg/buildContext.js";
import { planTargets } from "./planning/targetPlanner.js";
import { simulateGrid } from "./simulation/simulate.js";
import { buildTimeline } from "./timeline/schedules.js";
import { PRESETS } from "./config/presets.js";

// options.preset === "fast" | "cinematic" 이면
const policy = PRESETS[options.preset] ?? undefined;
const timeline = buildTimeline(ctx, plan, sim, policy);
```

현재는 `renderGridSvg(grid)`만 export하므로, 프리셋은 `buildTimeline`을 직접 호출하는 코드에서만 사용 가능.
