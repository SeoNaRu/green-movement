# 프로필 README에 잔디 SVG 올리기 (새벽 1시 자동)

이 프로젝트는 **매일 새벽 1시(KST)**에 GitHub 잔디 SVG를 생성하고, **프로필 README 저장소**에 자동으로 푸시하도록 설정할 수 있습니다.

---

## 1. 준비할 것

- **프로필 README 저장소**  
  GitHub 사용자명과 같은 이름의 공개 저장소가 있어야 합니다.  
  예: 사용자명이 `seonaru`이면 → `seonaru/seonaru` 저장소.
- **Personal Access Token (PAT)**  
  프로필 저장소에 푸시할 수 있는 권한이 있는 토큰이 필요합니다.

---

## 2. 프로필 저장소 만들기 (아직 없다면)

1. GitHub에서 **New repository** 클릭
2. **Repository name**을 **본인 사용자명과 똑같이** 입력 (예: `seonaru`)
3. Public, **Add a README file** 선택 후 생성
4. 이 저장소의 README가 **프로필 페이지**에 노출됩니다.

---

## 3. PAT(Personal Access Token) 만들기

1. GitHub **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. **Generate new token (classic)** 선택
3. **Note**: 예) `profile-readme-svg`
4. **Expiration**: 원하는 기간 (90일 / No expiration 등)
5. **Scopes**: **`repo`** 체크 (전체 체크)
6. **Generate token** 후 나온 토큰을 **한 번만** 복사해 두기 (다시 볼 수 없음)

---

## 4. green-movement 저장소에 Secret 추가

1. **green-movement** 저장소 페이지로 이동
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret** 클릭

| Name                   | Value                    |
| ---------------------- | ------------------------ |
| `PROFILE_README_TOKEN` | 위에서 만든 PAT 붙여넣기 |

(선택) 다른 계정의 잔디를 쓰고 싶다면:

| Name              | Value                         |
| ----------------- | ----------------------------- |
| `GITHUB_USERNAME` | 잔디를 가져올 GitHub 사용자명 |

- `GITHUB_USERNAME`을 넣지 않으면, **green-movement 저장소 소유자**의 잔디가 사용됩니다.

---

## 5. 프로필 README에 SVG 넣기

프로필 저장소(`username/username`)의 **README.md**에 아래처럼 이미지 링크를 넣습니다.

```markdown
## 🌱 잔디

![grass](https://raw.githubusercontent.com/본인사용자명/본인사용자명/main/assets/live.svg)
```

예 (사용자명이 `seonaru`인 경우):

```markdown
## 🌱 잔디

![grass](https://raw.githubusercontent.com/seonaru/seonaru/main/assets/live.svg)
```

- 워크플로가 **매일 새벽 1시(KST)**에 `assets/live.svg`를 갱신하므로, 위 주소만 넣어두면 자동으로 최신 잔디가 보입니다.

---

## 6. 동작 요약

| 항목      | 내용                                                                     |
| --------- | ------------------------------------------------------------------------ |
| 실행 시각 | 매일 **새벽 1시(KST)** (UTC 16:00)                                       |
| 실행 위치 | **green-movement** 저장소의 GitHub Actions                               |
| 하는 일   | ① 빌드 후 SVG 생성 ② 프로필 저장소에 `assets/live.svg` 푸시              |
| 수동 실행 | Actions 탭 → **Update profile README with grass SVG** → **Run workflow** |

---

## 7. 프로필 저장소에 `assets` 폴더가 없을 때

처음에는 프로필 저장소에 `assets` 폴더가 없을 수 있습니다.  
두 가지 방법이 있습니다.

**방법 A – 수동으로 한 번 만들기**

1. 프로필 저장소에서 **Add file** → **Create new file**
2. 파일 경로에 `assets/live.svg` 입력 (폴더가 자동 생성됨)
3. 내용은 아무거나 넣고 커밋 (예: 빈 줄 하나)
4. 다음 새벽 1시 실행부터 워크플로가 이 파일을 덮어씁니다.

**방법 B – 워크플로가 폴더만 만들어도 되게**

이미 사용 중인 워크플로에는 `mkdir -p ../profile-repo/assets`가 있으므로,  
프로필 저장소를 한 번 clone한 뒤 `assets`에 아무 파일 하나 넣고 푸시해 두면,  
그 다음부터는 워크플로가 `assets/live.svg`를 정상적으로 푸시합니다.

---

## 8. 새벽 1시가 아닌 다른 시간으로 바꾸고 싶을 때

`.github/workflows/update-profile-readme.yml`을 연 뒤, `schedule`의 `cron` 값만 수정하면 됩니다.

- **KST 01:00** (현재): `"0 16 * * *"` (UTC 16:00)
- **KST 02:00**: `"0 17 * * *"`
- **KST 00:00**: `"0 15 * * *"`

(매일 실행이면 `* * *` 부분은 그대로 두고, 앞의 시각만 바꾸면 됩니다.)

---

이렇게 설정하면 매일 새벽 1시에 SVG가 뽑혀서 프로필 README에 자동으로 반영됩니다.
