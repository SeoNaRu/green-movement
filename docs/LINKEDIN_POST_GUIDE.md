# GREEN / MOVEMENT — LinkedIn 포스트 가이드

프로젝트를 LinkedIn에 올릴 때 참고할 **알고리즘 요약**, **기술 스택**, **태그**, **포스트 예시**입니다.

---

## 1. 사용한 알고리즘·기법 요약

| 구분                           | 내용                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **BFS (Breadth-First Search)** | 입구에서 빈 칸만 4방향으로 확장해 도달 가능 영역·경로 복원(parent). 게이트→첫 잔디, 현재 위치→가장 가까운 잔디 후보 탐색에 사용. |
| **Reservation Table**          | 시간별 셀·엣지 점유를 기록해 여러 마리 양이 같은 칸/같은 간선을 동시에 쓰지 않도록 **Multi-Agent 경로 충돌 회피**.               |
| **Funnel (깔때기)**            | 그리드 위쪽 가상 영역을 삼각형으로 넓혀 “대기줄”을 만들고, 스폰 위치에서 게이트(입구 2칸)로 수렴하는 경로 생성.                  |
| **Priority / Queue Ordering**  | 입구에 가까운 양부터 이동 시도해, 게이트 근처에서 한꺼번에 몰리는 현상 완화.                                                     |
| **TTL (Time-To-Live)**         | 잔디 예약·접근칸 예약에 유효 시간을 두어, 멈춘 양이 계속 점유하지 않도록 자동 해제.                                              |
| **거리 기반 Steal**            | 예약이 오래됐을 때, 더 가까운 양이 해당 잔디/접근칸 예약을 “뺏을” 수 있게 해 기아 상태 감소.                                     |
| **4방향 경로 정규화**          | 대각선 이동을 한 칸씩 쪼개서 상하좌우만 사용 → 예약 테이블·충돌 판정을 단순하게 유지.                                            |
| **Quartile 기반 색상**         | GitHub 기여도(count)를 quartile로 나누어 LEVEL_0~4 색상(잔디 그라데이션) 적용.                                                   |

한 줄로 요약하면: **GitHub 잔디(기여 그리드)를 “목장 + 양” 비주얼로 바꾸고, BFS·Reservation Table·Funnel·TTL·Steal을 써서 여러 마리 양이 충돌 없이 잔디를 먹도록 시뮬레이션한 뒤 SVG로 렌더링**한 프로젝트입니다.

---

## 2. 기술 스택 (포스트/이력서용)

- **Language**: TypeScript
- **Runtime**: Node.js
- **Data**: GitHub API (Contribution Graph)
- **Output**: SVG (그리드 + 울타리 + 양 애니메이션)
- **Env**: dotenv (GITHUB_USERNAME)
- **CI**: GitHub Actions (프로필 README 자동 업데이트 등)

---

## 3. LinkedIn 포스트용 태그 (해시태그)

**영어 (추천)**  
`#TypeScript` `#Algorithms` `#BFS` `#MultiAgent` `#Pathfinding` `#Simulation` `#SVG` `#GitHub` `#SideProject` `#Coding` `#SoftwareEngineering` `#GameDev` (선택)

**한국어 (선택)**  
`#타입스크립트` `#알고리즘` `#시뮬레이션` `#개인프로젝트` `#개발` `#GitHub`

**포스트 끝에 넣을 때 예시**  
`#TypeScript #Algorithms #BFS #Pathfinding #Simulation #SVG #GitHub #SideProject`

---

## 4. 포스트 예시 (복사해서 수정해서 쓰기)

### A. 짧은 버전 (2~3문단)

```
GitHub 잔디(기여 그리드)를 "목장의 잔디"로 보고, 양들이 그 잔디를 먹으며 움직이는 걸 SVG로 시뮬레이션한 프로젝트를 만들어 봤어요.

• BFS로 입구에서 도달 가능한 빈 칸과 잔디 후보를 구하고
• Reservation Table로 여러 마리 양이 같은 칸/같은 길을 쓰지 않게 했고
• TTL·거리 기반 steal로 한 마리가 계속 점유하지 않도록 했습니다.
• 깔때기(Funnel)로 위쪽 대기줄을 만들고, 입구 가까운 순으로 이동해 게이트 근처 정체를 줄였어요.

결과는 SVG 한 장에 그리드 + 울타리 + 양 애니메이션으로 나오고, GitHub Actions로 프로필 README에 자동 반영되도록 해 두었습니다.

🔗 [레포 링크]
#TypeScript #Algorithms #BFS #Pathfinding #Simulation #SVG #GitHub #SideProject
```

### B. 조금 더 기술적인 버전 (알고리즘 강조)

```
"GREEN / MOVEMENT" — GitHub contribution grid를 목장 비주얼로 바꾼 시뮬레이션 프로젝트입니다.

[어떤 걸 했는지]
GitHub API로 가져온 기여 데이터를 2D 그리드로 매핑한 뒤, 빈 칸은 "길", 기여가 있는 칸은 "잔디"로 두고, 여러 마리 양이 입구에서 들어와 잔디를 먹는 과정을 틱 단위로 시뮬레이션했습니다. 최종 결과는 SVG(그리드 + 울타리 + 양 키프레임 애니메이션)로 렌더링됩니다.

[쓴 알고리즘·기법]
• BFS: 입구별 도달 가능 빈 칸, 게이트→첫 잔디 경로, 현재 위치→가장 가까운 잔디 후보 탐색
• Reservation Table: 시간별 셀·엣지 점유로 multi-agent 충돌 회피
• Funnel: 위쪽 대기 영역 + 게이트로 수렴하는 스폰/경로
• TTL + 거리 기반 steal: 예약 독점 완화
• Priority queue: 입구 가까운 양부터 이동 시도

TypeScript + Node.js로 구현했고, GitHub Actions로 프로필 README에 live SVG를 자동 업데이트하도록 설정해 두었습니다.

🔗 [레포 링크]
#TypeScript #Algorithms #BFS #MultiAgent #Pathfinding #Simulation #SVG #GitHub #SideProject
```

### C. 한 줄 요약 (프로필·이력서용)

```
GitHub 잔디를 목장으로 바꾼 시뮬레이션: BFS, Reservation Table, Funnel, TTL로 multi-agent 경로 계획 후 SVG 렌더링 (TypeScript).
```

---

## 5. 올릴 때 팁

1. **이미지**: `assets/live.svg`를 PNG로 캡처하거나, GitHub 레포 메인에 보이는 그리드+양 스크린샷을 한 장 넣으면 클릭률이 좋아집니다.
2. **링크**: 레포 URL을 한 번 넣어 두면 포스트 하단에 미리보기가 뜨므로, 레포 설명(README)이 잘 보이게 정리해 두는 것이 좋습니다.
3. **해시태그**: 5~8개 정도가 적당합니다. 위 추천 태그에서 프로젝트 성격에 맞게 골라 쓰면 됩니다.
4. **대상**: 개발자·알고리즘·시뮬레이션에 관심 있는 사람이라면 A 또는 B 버전, 짧게 소개만 하고 싶다면 A만 써도 충분합니다.

이 파일은 `docs/LINKEDIN_POST_GUIDE.md`로 두고, 필요할 때마다 복사해서 수정해 쓰시면 됩니다.
