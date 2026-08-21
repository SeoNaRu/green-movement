# 🌱 Green Movement

GitHub Contribution Graph를 **움직이는 미니어처 목장**으로 바꿔 주는 SVG 생성기입니다.
UFO가 양을 배치하고, 양이 실제 기여 셀을 먹으며, 마지막에 자신의 GitHub 아이디를 잔디로 남깁니다.

<p align="center">
  <img src="assets/live-light.svg#gh-light-mode-only" alt="green movement preview" width="700" />
  <img src="assets/live-dark.svg#gh-dark-mode-only" alt="green movement preview" width="700" />
</p>

<p align="center"><sub>검증용 샘플 미리보기·실제 생성 시 자신의 기여 데이터와 GitHub 아이디가 사용됩니다.</sub></p>

---

## 어떻게 움직이나요?

1. 전체 잔디 에너지에 따라 첫 방목 양이 1·2·4·6마리로 정해집니다. 이 양들이 먼저 인벤토리의 UFO에 차례로 승선하면 같은 UFO가 오른쪽 끝 우리에서 출발해 필드에 순서대로 내려놓습니다. UFO 본체는 출발과 도착 직전 8px에서만 보이고, 중간은 기존 초록빛과 속도선으로 건너뜁니다.
2. 양은 가까운 풀만 연달아 물지 않고 도달 가능한 먹이 사이의 3~4칸 실제 길을 걸으며 포만도를 채웁니다. 포만된 양도 마지막 잔디에서 굳어 있지 않고 기록된 빈길을 따라 다음 작업 셀 직전의 수거점까지 갑니다. 왼쪽 추적창은 실제 목장과 양을 1.30배로 확대해 더 넓은 주변 무리를 보여 주며, 이동·섭취·주변 맥락이 다른 대표 양을 오래 추적합니다. 가로 10칸 포만도도 실제 물기 기록에 맞춰 차오릅니다.
3. 중앙의 고정된 8칸 작은 우리는 아직 출동하지 않은 양만 보여 줍니다. `양떼 현재/전체`를 우리 왼쪽에 두고, 오른쪽 끝 우리는 UFO 전송 칸으로 함께 씁니다. 첫 방목 때 문이 열리면 UFO가 끝 우리 중앙에 천천히 정착하고, 제자리에 있는 양을 한 마리씩 흡수한 뒤 빈칸만 오른쪽으로 넘깁니다. 여섯 마리를 태우는 동안 기존 양의 칸은 되돌아가지 않습니다. 마지막 배치 UFO가 완전히 사라진 뒤 남은 양을 먼저 한 칸 옮기고, 새 양은 UFO 반대편인 왼쪽 끝부터 오른쪽으로 차례로 채워 8칸을 모두 사용합니다. 이후 교대에서는 필드의 찬 양을 수거한 바로 그 UFO가 끝 우리 중앙으로 들어와 다음 양을 흡수하고, 별도 상승 없이 그 펜 중심에서 실제 투하 셀을 향해 곧바로 출발합니다. 수거된 양은 패널에 돌아오지 않으며 마지막에는 `0/전체`와 빈 우리만 남습니다.
4. 대표 양이 수거되면 추적창은 다음 대표 양에게 약 0.715초 동안 이동합니다. 이동 중에는 포만도 정보를 비우고, 도착한 프레임에 새 양·귀표·포만도를 함께 표시합니다.
5. 하단 패널은 위 목장과 같은 12px 그리드·패딩·갈색 담장을 그대로 이어 씁니다. 오른쪽 36×4 미니맵에는 실제로 먹힌 위치가 누적되고 최신 bite 커서가 이동합니다. 현재 추적 양의 흔적만 귀표색의 작은 두 점으로 표시됩니다.
6. 마지막에도 먼저 먹은 양부터 UFO가 바로 수거합니다. UFO는 투명해지지 않고 해당 양의 기록된 셀 위에 불투명하게 정박하며, 양은 그 자리에서 본체 아래로 수납됩니다. 모두 떠나면 중앙 파동으로 GitHub 아이디를 남깁니다.

## 주요 특징

- 잔디 에너지에 따라 필드 인원을 1·2·4·6마리로 조절하고, 첫 양들을 8칸 대기 재고에서 한 UFO에 모두 태운 뒤 배치
- 배치·수거·마지막 중앙 집결·퇴장은 약 0.182초의 짧은 점멸 비행을 유지하고, 인벤토리 교대는 약 0.988초 동안 접근부터 보충까지 순서대로 보여 주며 본체가 숨는 전체 서비스 간격은 약 1.118초로 유지
- UFO 본체는 최대 8px의 양 끝 움직임에서만 보이고, 필드를 건너는 중간에는 작은 초록 코어와 한 줄 속도선만 표시
- 왼쪽 추적창은 별도 장식 양을 만들지 않고 실제 필드 양·자세·귀표·목장 셀을 그대로 확대
- 중복 먹이 후보를 제거하고 3~4칸의 실제 목장 경로를 우선해 걷는 시간을 늘리며, 포만 양은 기록된 수거 접근로를 끝까지 사용
- 대표 양이 수거된 뒤 약 0.715초의 카메라 이동 동안 정보를 비우고, 새 양과 포만도를 도착 프레임에 함께 표시
- 화면 밖 양 좌표를 사용하지 않으며, 초기·교대 양 모두 UFO 본체가 출발 점멸로 사라진 뒤에만 첫걸음을 시작
- 배치·수거 때는 UFO 본체를 0/1 불투명도로만 표시하고 양보다 위에 그려, 기록된 셀에서 우주선이 비쳐 보이지 않게 유지
- 전체 로스터·번호 배열 대신 왼쪽의 `현재 재고/전체 양`과 실제 양 최대 8마리만 작은 우리에 표시하고, UFO가 오른쪽 전송 칸 중앙에서 양을 흡수해 올라간 뒤 기존 줄을 한 칸 옮기고 마지막에 새 양 하나만 보충
- 수거한 에너지는 별도 화물로 만들지 않고 기존 UFO 중심빛이 정박 때 밝아졌다 사라지는 흐름과 마지막 잔디 파동으로만 연결
- 각 사용자의 활성 주 안에서 기여량을 상대 비교해 많이·보통·적게 먹는 양을 균형 있게 배정하고, 모든 양은 같은 크기로 시작해 먹은 만큼 성장
- 100% 포만일 때 많이 먹는 양은 적게 먹는 양보다 약 20% 크게 성장하며, 선택 양의 실제 섭취량은 `포만 n/목표`와 명확히 분리된 가로 10칸으로 표시
- 패널은 위 목장과 같은 53×5 셀 표면을 사용하고, 왼쪽 추적창은 소수의 대표 양을 실제 이동 경로로 오래 추적하며 오른쪽 지도는 현재 대표 양이 이미 먹은 칸에만 작은 두 점 발자국을 표시
- 양의 섭취, 이동, UFO 비행, 결말까지 기존 타임라인보다 30% 여유 있게 재생
- 애니메이션이 끝난 뒤에도 UFO 완료 요약과 모든 수거 상태를 그대로 유지
- 양 도착 전에 잔디가 사라지지 않는 인과적 섭취 타이밍
- GitHub 라이트·다크 테마 자동 대응
- 350px 이하에서는 작은 글자·우리·귀표 외곽선을 보강하고 미세한 보조 효과를 줄여 모바일 가독성 유지
- 영문, 숫자, 하이픈 GitHub 아이디 지원
  - 1–10자: 5×7 서명
  - 11–13자: 3×5 압축 서명
  - 14–26자: 중앙 정렬된 두 줄 3×3 서명
- GitHub Actions를 통한 매일 자동 갱신 및 로컬 생성 지원

---

## 🚀 프로필 README에 올리는 방법

### 1. 이 저장소 가져오기

- **Fork**: 이 저장소를 본인 계정으로 Fork
- 또는 **Use this template**: “Create a new repository”로 새 저장소 생성

> ⚠️ 가져온 저장소가 **본인 계정(또는 조직) 소유**여야 Actions와 Secrets를 쓸 수 있어요.

---

### 2. 프로필 README 저장소 준비하기

GitHub 프로필에 보이는 README는 **`사용자명/사용자명`** 공개 저장소의 `README.md`입니다.

- 아직 없다면: **New repository** → 이름을 **본인 GitHub 사용자명**으로, Public, README 포함해서 생성하세요.

---

### 3. 토큰(PAT) 만들기

프로필 저장소에 이 프로젝트가 생성한 SVG를 자동으로 푸시하려면 Personal Access Token이 필요해요.

1. GitHub **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. 대상 저장소로 자신의 프로필 저장소(`사용자명/사용자명`)만 선택
3. Repository permissions의 **Contents**를 **Read and write**로 설정
4. 생성된 토큰을 복사합니다.

GitHub 공식 안내: [프로필 README 설정](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme), [Fine-grained PAT 관리](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

---

### 4. Fork한 green-movement에 Secret 넣기

Fork(또는 Template)한 **green-movement** 저장소에서:

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| 이름                   | 값               | 설명                                     |
| ---------------------- | ---------------- | ---------------------------------------- |
| `PROFILE_README_TOKEN` | (방금 만든 토큰) | 프로필 저장소에 푸시할 때 사용. **필수** |

(선택) 다른 사람 잔디를 쓰고 싶다면:

| 이름              | 값                   |
| ----------------- | -------------------- |
| `GITHUB_USERNAME` | 대상 GitHub 사용자명. 마지막 잔디 서명에도 사용됩니다(영문·숫자·하이픈, 최대 26자; 14자부터 두 줄 압축). |

---

### 5. 프로필 README에 이미지 넣기

**프로필 저장소**(`사용자명/사용자명`)의 `README.md`에 아래를 추가하세요.

```md
## 🌱 잔디

![grass](https://raw.githubusercontent.com/사용자명/사용자명/main/assets/live-light.svg#gh-light-mode-only)
![grass](https://raw.githubusercontent.com/사용자명/사용자명/main/assets/live-dark.svg#gh-dark-mode-only)
```

> 브랜치가 `main`이 아니면 `main` 부분을 해당 브랜치 이름으로 바꿔 주세요.

---

### 6. 첫 SVG 만들기

**방법 A (권장)**
Fork한 **green-movement** 저장소에서:
**Actions** → **Update profile README with grass SVG** → **Run workflow**

**방법 B**
로컬에서 SVG를 생성한 뒤 프로필 저장소의 `assets/live.svg`로 수동 업로드합니다.

---

## ⏰ 자동 갱신

워크플로는 **매일 오후 10시(KST)** 에 실행되어, 프로필 저장소의 `assets/live.svg`를 갱신합니다.

- 시간을 바꾸고 싶다면: `.github/workflows/update-profile-readme.yml`에서 `cron` 값을 수정하세요.

---

## 💻 로컬에서 한 번만 SVG 만들기

Node.js 20.6 이상이 필요해요.

1. 프로젝트 루트에 `.env` 파일을 만들고:

```bash
GITHUB_TOKEN=ghp_xxxx   # repo 권한 있는 PAT
GITHUB_USERNAME=본인아이디   # 비우면 토큰 소유자 잔디 사용
```

2. 설치 후 실행:

```bash
npm install
npm run generate
```

성공하면 `assets/live.svg`, `assets/live-light.svg`, `assets/live-dark.svg`가 생성됩니다. 세 파일을 프로필 저장소의 `assets/`에 수동으로 올려도 됩니다.

---

## ✅ 로컬 검증

실제 GitHub 토큰 없이 고정 fixture로 빌드, TypeScript, 애니메이션 인과관계, 긴 아이디 레이아웃을 검사할 수 있습니다.

```bash
npm run check
npm run visual:fixture
```

`npm run visual:fixture`는 검수용 `dist/visual-fixture.svg`를 생성합니다.

---

## 📁 생성되는 SVG 크기

기본적으로 SVG 가로는 실제 프로필 표시 크기인 **700px**로 맞춰집니다.
다른 크기를 쓰고 싶다면 `src/config/constants.ts`의 `README_TARGET_WIDTH`를 수정하거나, 코드에서 `renderGridSvg(grid, { targetWidth: 700 })`처럼 옵션으로 넘기면 됩니다.

---

## 📚 프로젝트 문서

| 문서 | 내용 |
| --- | --- |
| [프로젝트 계약](docs/nulnul/project.md) | 목표, 제약, 검증 기준, 능력 구성 |
| [연출 연구와 샷 계약](docs/nulnul/directing-study-v12.md) | 모션 원칙, 비트별 타이밍, 기각 규칙 |
| [시각 벤치마크](docs/nulnul/visual-benchmark.md) | 700px 라이트·다크 테마 평가 기준 |
| [진화 체크포인트](docs/nulnul/evolution.json) | 피드백, 후보, 검증 근거, 롤백 규칙 |

하단 패널의 한글 픽셀 글꼴은 [Galmuri7](https://github.com/quiple/galmuri)의 SIL Open Font License 1.1 배포본을 SVG 안에 자체 포함합니다. 폰트 출처와 고정 해시는 [assets/fonts/README.md](assets/fonts/README.md)에 기록되어 있습니다.

---

## 📄 라이선스

현재 별도의 `LICENSE` 파일이 없습니다. 재사용·배포 범위는 저장소 소유자에게 확인해 주세요.
