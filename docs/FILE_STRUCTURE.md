# 파일 구조

```
green-movement/
├── .github/workflows/     # Actions (프로필 README 자동 업데이트)
├── assets/               # 출력 SVG, 울타리/양/UFO 에셋
│   ├── live.svg          # 생성된 잔디 애니메이션 (프로필에 노출)
│   ├── fance/            # 울타리 타일 SVG
│   └── *.svg             # sheep, ufo 등 참조용
├── docs/                 # 설계·스펙·가이드
│   ├── FILE_STRUCTURE.md      # 이 문서
│   ├── REFACTOR_PIPELINE.md   # 파이프라인·레이어 정리
│   ├── SVG_RENDER_STRUCTURE.md
│   └── ...
├── src/
│   ├── index.ts          # 진입점
│   ├── renderGridSvg.ts  # 파사드 → svg/renderGridSvg 호출
│   ├── app/
│   │   └── generateSvg.ts    # GitHub 그리드 fetch + SVG 생성 + 저장
│   ├── config/           # 상수·프리셋
│   │   ├── constants.ts  # 셀 크기, UFO/양 타이밍 등
│   │   └── presets.ts    # default / fast / cinematic 타이밍
│   ├── domain/           # 도메인 타입·FSM
│   │   ├── sheep.ts      # SheepPhase, SheepState
│   │   └── ufo.ts        # UfoPhase
│   ├── grid/
│   │   └── mapGrid.ts    # GridCell, mapGrid
│   ├── github/           # GitHub API
│   │   ├── fetchGrid.ts  # 잔디 그리드 조회
│   │   └── query.ts
│   ├── planning/         # 타겟·경로 플래닝
│   │   ├── types.ts      # PlanResult, TargetWithGate
│   │   └── targetPlanner.ts   # planTargets, TargetStrategy
│   ├── simulation/       # 시뮬 re-export
│   │   └── simulate.ts   # simulateGrid, SimulationResult
│   ├── timeline/         # 타임라인·스케줄
│   │   ├── types.ts      # TimelineResult
│   │   └── schedules.ts  # buildTimeline, TimingPolicy
│   └── svg/              # 레이아웃·시뮬·렌더
│       ├── renderGridSvg.ts   # 파이프라인 오케스트레이션
│       ├── buildContext.ts    # buildContext, GridContext
│       ├── constants.ts  # config 재사용 + SVG용
│       ├── gridLayout.ts # getCellCenterPx, 울타리 (→ layout/gridLayout)
│       ├── layout/gridLayout.ts
│       ├── pathUtils.ts  # BFS, 경로 유틸
│       ├── simHelpers.ts # buildPathFromToGrass 등
│       ├── sim/simulate.ts    # simulateGrid 구현
│       ├── reservationTable.ts
│       ├── contribution.ts    # 잔디 레벨·색
│       ├── anim/keyframes.ts  # grass/ufo/sheep 키프레임
│       ├── layers/       # 레이어 re-export
│       │   ├── grassLayer.ts
│       │   ├── ufoLayer.ts
│       │   └── sheepLayer.ts
│       └── render/composeSvg.ts
├── package.json
└── tsconfig.json
```

## 파이프라인

`buildContext` → `planTargets` → `simulateGrid` → `buildTimeline` → 레이어 빌드 → `composeSvg`

자세한 흐름·검증 방법: [REFACTOR_PIPELINE.md](./REFACTOR_PIPELINE.md)

## 참고

- 아키텍처·디자인 패턴·기술·알고리즘: [ARCHITECTURE_AND_TECH.md](./ARCHITECTURE_AND_TECH.md)
- SVG 렌더링 구조: [SVG_RENDER_STRUCTURE.md](./SVG_RENDER_STRUCTURE.md)
