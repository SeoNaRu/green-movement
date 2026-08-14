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

현재 모션은 잔디 에너지에 따라 필드에 0·1·2·4·6마리를 유지합니다. 한 양이 기여 레벨 합계 20점을 먹으면 UFO가 실제 위치에서 수거하고, 화면상 두 UFO가 겹치지 않는 안전한 셀에 새 번호의 배고픈 양을 내려 교대합니다. 새 양은 정리된 인접 경로를 셀당 0.312초로 걷고, 먼저 도착하면 다음 물기까지 중립 자세로 기다립니다. 포만도는 시간으로 흐르지 않으며 선택 양의 실제 `ENERGY n/20`과 10개 셀이 물기 순간에만 증가하고 짧게 반응합니다(레벨 1=반 칸, 레벨 4=두 칸). 전체 섭취·이동·UFO·결말 트랙은 한 `MOTION_TIME_SCALE=1.3`으로 재생됩니다. 하단 패널은 두 줄 로스터와 계단식 갈색 울타리 프레임을 사용하고, 종료 뒤에도 UFO·FIELD 0·GRASS 100%·수거 상태를 유지합니다. 마지막에는 실제 격자 거리로 계산한 셀 파면이 GitHub 아이디를 남깁니다. 1–10자는 5×7, 11–13자는 3×5, 14–26자는 중앙 정렬된 두 줄 3×3 서명을 사용하며 더 긴 값은 자르지 않고 명시적으로 중단합니다. 실제 생성은 `GITHUB_USERNAME → GITHUB_REPOSITORY_OWNER → GITHUB_ACTOR` 순서로 서명을 정합니다. 대표 fixture는 49.868초/1,223,216바이트이며 독립 시각 Gate에서 20/20으로 승인됐습니다.

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

최종 검증: 2026-08-14 `npm run check` 통과. 결정론적 fixture 1,223,216바이트/49.868초. 201개 인과 도착과 201회 물기 반응, 22회 원격 교대, 50개 직렬 UFO 정차, 43.267px 이상 분리, 정확한 0.312초 인접 셀 보행과 중립 대기, `ENERGY n/20`, 53개 유클리드 파면, 1·10·28·62마리 패널, 종료 상태와 강제 라이트·다크 검사가 통과했습니다. 독립 시각 Gate 점수는 20/20입니다. Feature `6555cdf`와 Actions run `31777271690`이 project `4b7521e`, profile asset `d8f7d4c`, profile README `16f60a7`을 배포했으며 공개 10마리 장면은 700x206/34.775초입니다.

```bash
DEBUG_SVG=1 npm run generate
```

### 모듈 시스템

전체 ESM(`"type": "module"`). 로컬 import는 반드시 `.js` 확장자를 사용해야 합니다. TypeScript 타겟은 ES2022 / NodeNext입니다.
