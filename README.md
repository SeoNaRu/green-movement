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

1. 전체 잔디 에너지에 따라 UFO가 필드에 양 1·2·4·6마리를 배치합니다. UFO는 출발과 도착 직전만 짧게 움직이고, 중간은 초록빛 점멸로 건너뜁니다.
2. 양은 도착한 잔디를 실제 물기 동작과 동기화해 먹고 포만도를 채웁니다. 선택 양의 가로 10칸과 각 번호 로스터 칸이 물기 기록에 맞춰 왼쪽에서 오른쪽으로 차오릅니다.
3. 양 한 마리가 배부르면 UFO가 실제 위치에서 회수합니다. 다음 양의 로스터 카드가 약 0.7초 먼저 밝아지고, 배부른 양이 사라진 뒤 왼쪽 선택 영역을 0.104초 비운 다음 새 번호·귀에 붙은 개별 색상 귀표·빈 포만도의 양을 보여 줍니다. UFO는 초록빛으로 점멸해 다른 위치로 이동하고, 새 양은 그 목적지 칸에서만 나타납니다.
4. 하단 패널은 잔디 그리드와 같은 픽셀 셀, 기존의 절제된 갈색 외곽선으로 필드와 이어집니다. 전체 폭의 `방목·양떼·잔디`, 왼쪽 양·번호·`포만 n/20`·가로 10칸, 그리고 오른쪽 위에 작은 색상 표식을 둔 정사각형 두 줄 로스터를 양 끝에 맞춰 균등 배치합니다.
5. 마지막에도 먼저 먹은 양부터 UFO가 바로 수거하고, 모두 떠난 뒤 중앙 파동으로 GitHub 아이디를 남깁니다.

## 주요 특징

- 잔디 에너지에 따라 필드 인원을 1·2·4·6마리로 조절하고, 포만 즉시 원격 교대
- 첫 UFO부터 배치·교대·수거·마지막 중앙 집결·퇴장까지 약 0.182초의 같은 `짧은 출발 → 밝은 초록 점멸 → 짧은 도착` 리듬 사용
- UFO 본체는 최대 8px의 양 끝 움직임에서만 보이고, 필드를 건너는 중간에는 작은 초록 코어와 한 줄 속도선만 표시
- 필드 양과 큰 초상화의 왼쪽 귀에 같은 1×1 목장 귀표를 달고, 포만 10칸 옆과 로스터 칸 오른쪽 위의 작은 표식까지 양마다 다른 색상을 공유
- 수거된 양과 새 양 사이에는 0.104초의 빈 선택 영역을 두며, 별도 수거·출동 문구 없이 번호·귀표·포만도 변화만으로 교대
- 화면 밖 양 좌표를 사용하지 않으며, 초기·교대 양 모두 UFO 본체가 출발 점멸로 사라진 뒤에만 첫걸음을 시작
- 최대 마리 수 제한 없이 모든 양을 GitHub 잔디 톤의 두 줄 패널에 표시
- 선택 양의 실제 섭취량을 `포만 n/20`과 가로 10칸으로 표시하고, 각 정사각형 로스터 칸도 물기 기록에만 맞춰 왼쪽에서 오른쪽으로 차오름
- `방목·양떼·잔디` 상태 셀은 패널 전체 폭을 3등분하고, 정사각형 두 줄 로스터는 available width에 `space-between`으로 배치
- 양의 섭취, 이동, UFO 비행, 결말까지 기존 타임라인보다 30% 여유 있게 재생
- 애니메이션이 끝난 뒤에도 UFO 완료 요약과 모든 수거 상태를 그대로 유지
- 양 도착 전에 잔디가 사라지지 않는 인과적 섭취 타이밍
- GitHub 라이트·다크 테마 자동 대응
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
