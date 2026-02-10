# GREEN / MOVEMENT

A playful grid-based simulation exploring green movement, flocks, and evolving landscapes.

<p align="center">
  <img src="assets/live.svg" alt="green movement" />
</p>

> 이 저장소를 Fork(또는 Template)하면
> 누구나 **자기 GitHub 프로필 README**에 “목장 + 양” 스타일의 SVG 잔디를 자동으로 붙일 수 있어요.

---

## Quick Start (프로필에 붙이기)

### 1) 저장소 가져오기

- **Fork**: `SeoNaRu/green-movement` → Fork
- 또는 **Use this template**: 새 저장소 생성

> 가져온 저장소가 **본인 계정/조직 소유**여야 Actions/Secrets를 사용할 수 있습니다.

---

### 2) 프로필 README 저장소 준비

GitHub 프로필 README는 **`사용자명/사용자명`** 공개 저장소의 `README.md`로 표시됩니다.

- 없으면 새로 만들기: Repository name = **본인 사용자명**, Public, README 포함

---

### 3) PAT(토큰) 생성

프로필 저장소에 자동 푸시하려면 Personal Access Token이 필요합니다.

- GitHub Settings → Developer settings → Personal access tokens → **Tokens (classic)**
- **Generate new token (classic)**
- Scopes: **repo**
- Expiration: 90 days 또는 No expiration

> 토큰은 생성 직후 한 번만 보이니 꼭 복사해 두세요.

---

### 4) Fork한 green-movement에 Secret 추가

Fork(또는 Template)한 `green-movement` 저장소에서:

Settings → Secrets and variables → Actions → **New repository secret**

- `PROFILE_README_TOKEN` = 위에서 만든 토큰

(선택) 다른 사람 잔디를 쓰고 싶다면:

- `GITHUB_USERNAME` = 대상 GitHub 사용자명

---

### 5) 프로필 README에 이미지 추가

프로필 저장소(`사용자명/사용자명`)의 `README.md`에 아래를 추가합니다.

```md
## 🌱 잔디

![grass](https://raw.githubusercontent.com/사용자명/사용자명/main/assets/live.svg)
```

> 기본 브랜치가 `main`이 아니면 브랜치명을 바꿔주세요.

---

### 6) 첫 실행 (assets 폴더가 비어 있을 때)

아래 둘 중 하나만 하면 됩니다.

- **방법 A (권장)**
  green-movement → Actions →
  **Update profile README with grass SVG** → Run workflow

- **방법 B**
  프로필 저장소에 `assets/live.svg` 빈 파일을 한 번 만들어 커밋

---

## 자동 업데이트

- 워크플로는 **매일 새벽 1시(KST)** 실행되어
  프로필 저장소의 `assets/live.svg`를 자동으로 갱신합니다.
- 시간 변경: `.github/workflows/update-profile-readme.yml`의 cron 수정
  (KST 01:00 = UTC 16:00 → `cron: "0 16 * * *"`)

---

## 로컬에서 한 번만 SVG 생성하기 (.env)

Node.js 18+

1. 프로젝트 루트에 `.env` 생성

```bash
GITHUB_TOKEN=ghp_...          # 필수 (repo 권한)
GITHUB_USERNAME=본인아이디     # 선택
```

2. 실행

```bash
npm install
npm run generate
```

---

## Dev Notes

- 파일 구조: `docs/FILE_STRUCTURE.md`
- SVG 렌더링 구조: `docs/SVG_RENDER_STRUCTURE.md`

---

_Original idea: green-movement_
