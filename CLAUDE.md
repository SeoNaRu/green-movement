# CLAUDE.md

`AGENTS.md` is the canonical repository guidance. Resume from `docs/nulnul/evolution.json` and use `docs/nulnul/visual-benchmark.md` for visual changes.

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 명령어

```bash
npm run build      # tsc 컴파일 → dist/
npm run check      # build + 엄격한 미사용 코드 검사 + 고정 SVG 스모크 테스트
npm run visual:fixture # dist/visual-fixture.svg 생성 (네트워크/토큰 불필요)
npm run start      # node dist/index.js  (.env 필요)
npm run generate   # build + start (전체 파이프라인)
```

테스트 프레임워크 및 린트 스크립트는 없습니다.

현재 세부 모션 계약과 검증 수치는 중복 기록하지 않고 `AGENTS.md`와 `docs/nulnul/evolution.json`을 따릅니다. 요약하면 필드는 잔디 에너지에 따라 0·1·2·4·6마리를 유지하고, 하단은 왼쪽 `양떼 current/total`, 오른쪽 끝을 UFO 전송 칸으로 겸하는 여덟 칸 대기 재고, 실제 목장을 1.30배로 재사용하는 190×40 카메라, 36×4 섭취 지도를 한 표면에 배치합니다. 첫 비행 전에는 UFO가 오른쪽 끝 슬롯 중앙에 정착해 고정된 양을 한 마리씩 흡수하며, 여덟 슬롯의 좌표를 유지한 채 화면 안의 대기 양만 오른쪽으로 한 칸씩 이동합니다. 마지막 배치 UFO가 완전히 사라진 뒤 기존 양을 먼저 옮기고, 새 양은 왼쪽 끝부터 오른쪽으로 개별 보충해 여덟 칸을 모두 사용합니다. 이후 교대도 접근→정착→흡수→상승→기존 7마리 이동→왼쪽 새 양 보충→정확한 필드 투입 순서를 재사용하며, 보충 양은 줄 이동이 끝나기 전에 나타나지 않습니다. 양은 중복을 제거한 후보 중 3~4칸의 실제 먹이 경로를 우선하고, 포만 뒤에도 기록된 빈 접근로를 수거 직전까지 걷습니다. 필드의 UFO는 0/1 불투명도만 사용하며 기록된 셀의 양 위에 그려집니다. 모든 이동·섭취·교대·성장·결말은 기록된 셀과 시각 타임라인에서 결정론적으로 생성됩니다.

꽃 렌더러는 삭제되었고 `scripts/check-svg.mjs`의 재등장 방지 검사만 유지합니다.

## 환경 설정

`.env.sample`을 `.env`로 복사한 뒤 값을 채웁니다:
- `GITHUB_TOKEN` — `read:user` 스코프를 가진 Personal Access Token (필수)
- `GITHUB_USERNAME` — 잔디를 가져올 대상 사용자명. 비워두면 토큰 소유자 기준

## 아키텍처

GitHub 기여 그리드를 가져와, 양(과 UFO)이 기여 셀을 먹어치우는 애니메이션 SVG로 렌더링하는 프로젝트입니다.

### 파이프라인 (`src/app/generateSvg.ts`)

```
fetchContributionGrid()   → 주간 배열 weeks[][]{date,count}   (github/fetchGrid.ts)
mapGrid()                 → GridCell[]                         (grid/mapGrid.ts)
renderGridSvg()           → SVG 문자열                         (svg/renderGridSvg.ts)
writeFileSync             → assets/live.svg
```

### `renderGridSvg` 내부 (`src/svg/renderGridSvg.ts`)

메인 렌더 함수가 6단계를 순서대로 실행합니다:

1. **`buildContext`** (`svg/buildContext.ts`) — 픽셀 좌표, 울타리 rect, 사분위수, 셀 룩업 맵 계산
2. **`planTargets`** (`planning/targetPlanner.ts`) — 양 수, 스폰 위치(깔때기), 잔디 타겟, 예약 셀 집합 결정
3. **`simulateGrid`** (`svg/sim/simulate.ts`) — 틱 기반 BFS 시뮬레이션. `positionsHistory`(양별·틱별 [col,row]) 생성
4. **`buildTimeline`** (`timeline/schedules.ts`) — 틱 위치를 절대 초(second)로 변환. 스폰·도착·이동 시작·UFO 진입/퇴장·픽업·페인트 스윕 등 모든 이벤트 타이밍 포함
5. **레이어 빌더** — 각각 SVG 문자열 조각과 키프레임 문자열 반환:
   - `buildGrassLayer` — 셀별 색상 `<rect>` + 페이드 키프레임
   - `buildGrassCrumbsLayer` — 먹힐 때 파티클 부스러기 효과
   - `buildUfoLayer` — UFO 이동, 빔 조명, 파문(ripple)
   - `buildSheepLayer` — 양별 걷기 애니메이션 `<g>`
6. **`composeSvg`** (`svg/render/composeSvg.ts`) — 모든 조각을 최종 `<svg>` 문자열로 조립

### 주요 상수 (`src/config/constants.ts`)

모든 타이밍 상수(`SHEEP_CELL_TIME`, `GRASS_FADE_DURATION`, `UFO_ENTRY_S`, `UFO_EXIT_S` 등)와 양·UFO 글리프의 인라인 SVG 경로 데이터가 여기에 있습니다.
`assets/sheep.svg`와 `assets/ufo.svg`는 인라인 글리프의 독립 미리보기이므로 팔레트와 도형을 함께 갱신합니다.

### 좌표 시스템

- `GridCell.x` = 주(week) 인덱스 (열), `GridCell.y` = 요일 (0=일요일, 6=토요일)
- 셀 키는 항상 `"x,y"` (열,행) 형태의 문자열. `byKey.get("col,row")`
- 마지막 아이디 페인트 셀은 `src/svg/signature.ts`의 픽셀 글꼴에서 생성하며 내부 셀 키와 같은 `"col,row"` 순서를 사용합니다. 1–10자는 5×7, 11–13자는 3×5, 14–26자는 중앙 정렬된 두 줄 3×3을 사용합니다.

### 양 수 결정 로직 (`svg/buildContext.ts`)

잔디 기여 레벨 에너지 합계 기준으로 자동 계산:
```
0 → 0마리, 1–40 → 1마리, 41–160 → 2마리,
161–480 → 4마리, 481 이상 → 6마리
```
플래너는 서로 다른 도달 가능한 먹이·착지점을 만들 수 없을 때만 이 상한보다 줄입니다. 필드 총원은 유지하되, 포만 양마다 한 대의 UFO가 수거 위치와 다른 투입 위치를 차례로 방문합니다. 새 양은 착지 공개가 끝나는 즉시 안전한 기록 경로로 다음 잔디에 합류합니다. 양은 최단 회전, 이동 중 몸 바운스, 실제 섭취 기록에만 연결된 물기 연기와 성장/양털 에너지를 사용합니다.

### 출력

`assets/live.svg`, `assets/live-light.svg`, `assets/live-dark.svg` — 같은 애니메이션에서 생성한 자동·강제 테마 SVG입니다. 마지막 잔디 서명은 소스에 내장되어 별도 페인트 맵 파일이 필요하지 않습니다.

## GitHub Actions

`.github/workflows/update-profile-readme.yml` — 매일 KST 22:00에 세 SVG를 생성해 프로젝트 README 미리보기와 프로필 저장소(`사용자명/사용자명`)의 테마별 자산·README 고정 링크를 함께 갱신합니다.

필요한 저장소 시크릿:
| 시크릿 | 설명 |
|---|---|
| `PROFILE_README_TOKEN` | 프로필 저장소에 push 권한이 있는 PAT (필수) |
| `GITHUB_USERNAME` | 잔디를 가져올 사용자명 (없으면 저장소 소유자 사용) |
| `PROFILE_README_USERNAME` | 프로필 저장소 소유자 (없으면 저장소 소유자 사용) |

`workflow_dispatch`로 수동 실행도 가능합니다.

## 디버그

`DEBUG_SVG=1` 환경변수를 설정하면 SVG에 UFO 드롭 위치를 나타내는 초록 점 레이어가 추가됩니다.

현재 로컬 후보의 검증 결과와 롤백 지점은 `AGENTS.md`, 재개 체크포인트는 `docs/nulnul/evolution.json`에서 확인합니다. 배포와 외부 쓰기는 명시적 승인 전까지 수행하지 않습니다.

```bash
DEBUG_SVG=1 npm run generate
```

### 모듈 시스템

전체 ESM(`"type": "module"`). 로컬 import는 반드시 `.js` 확장자를 사용해야 합니다. TypeScript 타겟은 ES2022 / NodeNext입니다.
