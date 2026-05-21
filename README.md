# 🍱 우미위키 점심 메뉴 알림 봇

평일 11시~13시 사이, 토리송과 상록 두 식당 메뉴가 모두 올라오면  
카카오톡 나에게 보내기로 자동 알림이 옵니다.

**동작 방식**
- GitHub Actions가 평일 오전 11시~오후 1시에 5분마다 실행
- Playwright(헤드리스 브라우저)로 우미위키 메뉴 이미지 캡처
- Claude Vision이 이미지에서 메뉴 텍스트 추출
- 두 식당 모두 준비되면 카카오톡으로 전송 (하루 1회)

---

## 설정 가이드

### Step 1 — GitHub 레포 만들기

1. https://github.com/new 에서 **비공개(Private)** 레포 생성
2. 이 폴더 내용을 전부 업로드하거나 git push

```bash
cd woomi-lunch-bot
git init
git add .
git commit -m "초기 설정"
git remote add origin https://github.com/YOUR_ID/woomi-lunch-bot.git
git push -u origin main
```

---

### Step 2 — 카카오 앱 만들기 (5분)

1. https://developers.kakao.com 접속 → 로그인
2. **내 애플리케이션 > 애플리케이션 추가하기**
   - 앱 이름: `우미위키봇` (아무거나)
3. 앱 선택 후 왼쪽 메뉴 **카카오 로그인 > 활성화 설정 → ON**
4. **Redirect URI 등록**: `https://localhost`
5. **동의항목** 탭 → `카카오톡 메시지 전송` → 필수 동의
6. **앱 키** 탭에서 **REST API 키** 복사해두기

---

### Step 3 — 카카오 토큰 발급

터미널에서:

```bash
npm install
KAKAO_CLIENT_ID=12ffa06f03384b2f7c169a1ccb3ccf42 node src/get-kakao-token.js
```

안내에 따라 브라우저 로그인 → code 붙여넣기 →  
터미널에 출력되는 토큰 값들을 복사해두세요.

---

### Step 4 — GitHub Secrets 등록

GitHub 레포 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 이름 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 키 (https://console.anthropic.com) |
| `KAKAO_ACCESS_TOKEN` | Step 3에서 받은 access_token |
| `KAKAO_REFRESH_TOKEN` | Step 3에서 받은 refresh_token |
| `KAKAO_CLIENT_ID` | 카카오 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 카카오 Client Secret (설정한 경우만) |
| `GH_PAT` | GitHub Personal Access Token (토큰 자동갱신용) |

> **GH_PAT 발급**: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens  
> 권한: 해당 레포의 **Secrets (Read & Write)**

---

### Step 5 — 테스트 실행

GitHub 레포 → **Actions 탭 → 🍱 우미위키 점심 메뉴 알림 → Run workflow**

카카오톡에 메시지가 오면 성공! 🎉

---

## 카카오톡 메시지 예시

```
🍽️ [우미위키] 5월 20일 (수) 점심 메뉴
────────────────────────
🍗 토리송 (B1)
치킨마요덮밥
된장국
깍두기
계란말이

🥗 상록 (2층)
비빔밥
순두부찌개
잡채
시금치나물
깍두기

────────────────────────
📍 C동 | 평일 11am–2pm
```

---

## 자주 묻는 것

**Q: 하루에 여러 번 오지 않나요?**  
A: `sent_today.json`으로 오늘 전송 여부를 추적해서 하루 1회만 전송합니다.

**Q: 카카오 액세스 토큰이 만료되면?**  
A: 봇이 자동으로 리프레시 토큰으로 갱신하고, GitHub Secrets도 자동 업데이트합니다.

**Q: 주말에도 실행되나요?**  
A: cron이 `1-5` (평일)로 설정되어 주말엔 실행되지 않습니다.
