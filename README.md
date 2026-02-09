# GREEN / MOVEMENT

A playful grid-based simulation exploring green movement, flocks, and evolving landscapes.

<p align="center">
  <img src="assets/live.svg" alt="green movement" />
</p>

---

이 저장소를 **Fork**하거나 **Use this template**으로 가져가면, **자기 GitHub 프로필 README**에 같은 스타일의 잔디(목장 + 양) SVG를 넣을 수 있다.

### 1. 저장소 가져오기

- **Fork**: 이 저장소(`SeoNaRu/green-movement`) 우측 상단 **Fork** → 자기 계정에 `green-movement` 생성
- 또는 **Use this template** → **Create a new repository** 로 새 저장소 만들기

가져온 저장소가 **자기 계정/조직** 소유여야 Actions와 Secrets를 쓸 수 있다.

---

### 2. 프로필 README 저장소 준비

GitHub 프로필에 보이는 README는 **사용자명과 같은 이름의 공개 저장소**에 있는 `README.md`다.

- 아직 없으면: **New repository** → Repository name에 **본인 GitHub 사용자명** 그대로 입력 (예: `myfriend`) → Public, **Add a README file** 후 생성
- 이미 있으면: 그 저장소(`myfriend/myfriend`)만 있으면 됨

---

### 3. 토큰(PAT) 만들기

프로필 저장소에 자동으로 푸시하려면 **Personal Access Token**이 필요하다.

1. GitHub **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. **Generate new token (classic)**
3. **Note**: 예) `profile-readme-grass`
4. **Expiration**: 90 days 또는 No expiration
5. **Scopes**: **repo** 체크
6. **Generate token** 후 나온 토큰을 **한 번만** 복사해 두기

---

### 4. 가져온 green-movement 저장소에 시크릿 넣기 (토큰/아이디 설정)

1. **자기 계정의 green-movement** 저장소로 이동 (Fork한 곳)
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
   - **Name**: `PROFILE_README_TOKEN` (그대로 입력)
   - **Secret**: 위에서 복사한 토큰 붙여넣기
   - **Add secret**
4. (선택) **다른 사람 잔디**를 쓰고 싶다면 시크릿 하나 더 추가:
   - **Name**: `GITHUB_USERNAME`
   - **Secret**: 잔디를 가져올 GitHub 사용자명

> **왜 `.env` 대신 시크릿을 쓰나요?**  
> GitHub Actions는 저장소 안의 `.env` 파일을 읽지 않고,  
> 워크플로에서  
> `GITHUB_TOKEN: ${{ github.token }}`,  
> `GITHUB_USERNAME: ${{ secrets.GITHUB_USERNAME || github.repository_owner }}`  
> 처럼 **직접 env를 주입**합니다.  
> 그래서 **자동 업데이트만 쓸 때는 `.env`가 전혀 필요 없고**,  
> 친구는 여기에서 시크릿만 올바르게 설정하면 **자기 GitHub 아이디 기준 잔디 SVG**를 만들 수 있습니다.

---

### 5. 프로필 README에 이미지 넣기

**프로필 저장소**(`본인사용자명/본인사용자명`)의 **README.md**에 아래처럼 추가한다.

```markdown
## 🌱 잔디

![grass](https://raw.githubusercontent.com/본인사용자명/본인사용자명/main/assets/live.svg)
```

예: 사용자명이 `myfriend`이면

```markdown
## 🌱 잔디

![grass](https://raw.githubusercontent.com/myfriend/myfriend/main/assets/live.svg)
```

- 기본 브랜치가 `main`이 아니면 `main`을 해당 브랜치명으로 바꾼다.

---

### 6. 첫 SVG 채우기 (assets 폴더가 비어 있을 때)

프로필 저장소에 `assets` 폴더가 없으면 워크플로가 한 번은 실패할 수 있다. 아래 중 하나만 하면 된다.

**방법 A – 수동으로 한 번 만들기**

1. 프로필 저장소에서 **Add file** → **Create new file**
2. 파일 경로에 `assets/live.svg` 입력 (폴더 자동 생성)
3. 내용에 빈 줄 하나 넣고 커밋
4. 그 다음에 워크플로를 돌리면 `live.svg`가 덮어써진다.

**방법 B – 워크플로 한 번 수동 실행**

1. **green-movement** 저장소 → **Actions** 탭
2. **Update profile README with grass SVG** 선택 → **Run workflow**
3. 실행이 끝나면 프로필 저장소에 `assets/live.svg`가 생성·푸시된다.

---

### 7. 자동 업데이트

- **매일 새벽 1시(KST)**에 워크플로가 돌면서 잔디 SVG를 만들고, **자기 프로필 저장소**의 `assets/live.svg`를 자동으로 푸시한다.
- **지금 한 번만 돌리고 싶을 때**: green-movement 저장소 → **Actions** → **Update profile README with grass SVG** → **Run workflow**
- **시간 바꾸고 싶을 때**: `.github/workflows/update-profile-readme.yml`에서 `cron: "0 16 * * *"` 숫자만 수정 (KST 01:00 = UTC 16:00)

---

### 요약

| 단계 | 할 일 |
|------|--------|
| 1 | 이 저장소 Fork 또는 Use this template |
| 2 | 프로필용 저장소 `본인사용자명/본인사용자명` 만들기 (없으면) |
| 3 | PAT 만들기 (repo 권한) |
| 4 | Fork한 green-movement → Settings → Actions secrets에 `PROFILE_README_TOKEN` 추가 |
| 5 | 프로필 README에 `![grass](https://raw.githubusercontent.com/본인사용자명/본인사용자명/main/assets/live.svg)` 넣기 |
| 6 | 필요하면 `assets/live.svg` 한 번 수동 생성 또는 워크플로 수동 실행 |

이렇게 하면 친구도 자기 프로필에 같은 스타일의 잔디를 넣고, 매일 자동으로 갱신할 수 있다.

---

## 로컬에서 한 번만 SVG 만들어 보기 (`.env` 사용하는 경우)

- `Node.js` 18 이상
- 로컬에서는 GitHub가 토큰을 넣어주지 않으므로, 직접 `.env`를 만들어야 한다.

1. 프로젝트 루트에 `.env` 파일 생성
2. 아래처럼 작성

```bash
GITHUB_TOKEN=ghp_...          # 필수, repo 권한 있는 토큰
GITHUB_USERNAME=본인아이디    # 선택, 없으면 토큰 소유자 잔디 사용
```

3. 명령 실행

```bash
npm install
npm run generate
```

- 실행이 끝나면 `assets/live.svg` 가 생성되며,  
  이 파일을 직접 열어서 잔디/양 애니메이션을 미리 볼 수 있다.

---

*원본 아이디어: [green-movement](https://github.com/SeoNaRu/green-movement)*
