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

현재 모션 후보는 원래 UFO가 첫 배치점 바로 위에서 진입해 0.64초에 `[5,1]`로 착륙합니다. 중앙 방문·대기·선회는 없습니다. 일반 배치 비행은 0.40초 속도를 유지하고, 중간 공중 재배치는 전체 2.40초(접근 0.30·탑승 0.45·운반 1.20·착지 0.45)로 고정합니다. 양은 잔디 밀도와 무관하게 최대 6마리이며, 여섯 개의 서로 다른 도달 가능한 먹이·착지점을 만들 수 없을 때만 줄어듭니다. 선발 4마리 후 2마리는 재배치가 끝난 7.54/8.24초에 증원되며, 각 양은 착지 공개가 끝나는 즉시 걷습니다. 물기 연기는 실제 잔디 도착 기록에만 연결됩니다. 도착 60ms 전 준비, 도착 시 머리 후퇴, 120ms에 머리 전진·몸 압축·첫 잔디 감소·부스러기 발생, 230ms에 잔디 완전 소멸과 자세 회복, 240ms에 출발합니다. 충돌 대기는 먹는 동작을 하지 않습니다. 꽃과 리더 양은 없습니다. 마지막에는 실제 격자 거리로 계산한 셀 파면이 GitHub 아이디를 남깁니다. 1–10자는 5×7, 11–13자는 3×5, 14–26자는 중앙 정렬된 두 줄 3×3 서명을 사용하며 더 긴 값은 자르지 않고 명시적으로 중단합니다. 실제 생성은 `GITHUB_USERNAME → GITHUB_REPOSITORY_OWNER → GITHUB_ACTOR` 순서로 서명을 정합니다. 현재 후보 측정값은 38.69초/799,308바이트입니다. 독립 시각 Gate 전까지 승격하지 않습니다.

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

잔디 셀 수 기준으로 자동 계산:
```
sheepCountCap = grassCount > 0 ? 6 : 0
```
빈 해는 0마리이고, 잔디가 있으면 밀도와 무관하게 6마리를 시도합니다. 단, 서로 다른 도달 가능한 먹이·착지점이 6개 미만이면 플래너가 안전하게 줄입니다. 대표 장면은 선발 4마리를 먼저 투입하고, UFO가 작업 중인 양 한 마리를 실제 시뮬레이션 위치에서 한 번 공중 재배치한 뒤 2마리를 증원합니다. 모든 양은 착지 공개가 끝나는 즉시 걷습니다. UFO는 이 단일 사건 외에는 화면 밖에 머물다가 회수 시 다시 들어옵니다. 양은 최단 회전, 이동 중 몸 바운스, 실제 섭취 기록에만 연결된 물기 연기와 성장/양털 에너지, 착지와 회수를 서로 다른 중첩 그룹으로 표현합니다.

### 출력

`assets/live.svg` — 생성된 애니메이션 SVG. 마지막 잔디 서명은 소스에 내장되어 별도 페인트 맵 파일이 필요하지 않습니다.

## GitHub Actions

`.github/workflows/update-profile-readme.yml` — 매일 KST 22:00에 SVG를 생성하고 프로필 저장소(`사용자명/사용자명`)의 `assets/live.svg`에 푸시합니다.

필요한 저장소 시크릿:
| 시크릿 | 설명 |
|---|---|
| `PROFILE_README_TOKEN` | 프로필 저장소에 push 권한이 있는 PAT (필수) |
| `GITHUB_USERNAME` | 잔디를 가져올 사용자명 (없으면 저장소 소유자 사용) |
| `PROFILE_README_USERNAME` | 프로필 저장소 소유자 (없으면 저장소 소유자 사용) |

`workflow_dispatch`로 수동 실행도 가능합니다.

## 디버그

`DEBUG_SVG=1` 환경변수를 설정하면 SVG에 UFO 드롭 위치를 나타내는 초록 점 레이어가 추가됩니다.

최종 로컬 검증: 2026-08-13 `npm run check` 통과. 결정론적 fixture 799,308바이트/38.69초. 중간 공중 재배치는 3.91–6.31초의 2.40초 전체 샷으로 고정되고, 증원 2마리는 7.54/8.24초로 늦춰짐. 201개 인과 도착과 기존 53개 유클리드 파면 검사가 유지되며, 25자 두 줄 3×3 서명과 27자 명시적 거부 검사가 통과함.

```bash
DEBUG_SVG=1 npm run generate
```

### 모듈 시스템

전체 ESM(`"type": "module"`). 로컬 import는 반드시 `.js` 확장자를 사용해야 합니다. TypeScript 타겟은 ES2022 / NodeNext입니다.
