# 머더미스터리.com

머더미스터리/방탈출을 좋아하는 사람들의 성향 궁합 + 모임 기록 커뮤니티.

- 프론트: React + Vite
- 데이터: Firebase Auth(구글 로그인) + Firestore
- 배포: Firebase Hosting (GitHub Actions로 main 브랜치 push 시 자동 배포)
- AI: Gemini 2.5-flash-lite (추후 Firebase AI Logic으로 연동 예정)

## 로컬 개발

```bash
npm install
npm run dev
```

`.env.example`을 복사해 `.env`로 만들고 Firebase 콘솔 값을 채워 넣어야 로그인/DB가 동작합니다.

```bash
cp .env.example .env
```

## 처음 세팅할 때 (사용자가 콘솔에서 직접 해야 하는 것)

### 1. Firebase 프로젝트 만들기
1. https://console.firebase.google.com → 프로젝트 추가 → 이름 입력(예: mystery-club) → **Spark(무료) 플랜** 그대로 진행
2. 프로젝트 설정 → 일반 → "내 앱" → 웹 앱 추가(</> 아이콘) → 표시된 `firebaseConfig` 값을 `.env`에 복사
3. **Authentication** → 시작하기 → 로그인 방법 → **Google** 사용 설정
4. **Firestore Database** → 데이터베이스 만들기 → 프로덕션 모드 → 리전은 `asia-northeast3(서울)` 추천

### 2. Firestore 보안 규칙 배포
```bash
npm install -g firebase-tools
firebase login
firebase use --add   # 방금 만든 프로젝트 선택 → .firebaserc의 project id 자동 반영
firebase deploy --only firestore:rules
```

### 3. GitHub 저장소 연결
1. GitHub에서 새 저장소 생성 (Public/Private 무관, 무료)
2. 이 폴더에서:
   ```bash
   git remote add origin https://github.com/<아이디>/<저장소명>.git
   git push -u origin main
   ```
3. 저장소 → Settings → Secrets and variables → Actions 에 아래 값 등록:
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
     (.env와 동일한 값)
   - `FIREBASE_SERVICE_ACCOUNT`: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로
     받은 JSON 파일 전체 내용을 그대로 붙여넣기
4. main 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드 후 Firebase Hosting에 배포합니다.

### 4. 머더미스터리.com 도메인 연결
1. Firebase 콘솔 → Hosting → **커스텀 도메인 추가** → `머더미스터리.com` (실제로는 퓨니코드로 자동 변환됨) 입력
2. Firebase가 안내하는 TXT 레코드(소유권 확인)와 A 레코드를 도메인 구입처(가비아 등) DNS 설정에 등록
3. DNS 전파(최대 24~48시간) 후 Firebase가 자동으로 SSL 인증서 발급 — GitHub Pages 때 쓰던 A 레코드(185.199.x.x)는 더 이상 사용하지 않음

## 폴더 구조

```
src/
  lib/
    firebase.js       # Firebase 초기화
    personality.js     # 성향 설문/궁합 계산 로직
  context/
    AuthContext.jsx     # 로그인 상태 + Firestore 유저 프로필
    ThemeContext.jsx     # 라이트/다크 테마
  components/
    AppShell.jsx        # 사이드바(데스크톱)/탭바(모바일) 레이아웃
  pages/                # 화면별 페이지
  styles/
    tokens.css           # 라이트/다크 디자인 토큰 (Claude Design에서 추출)
```

## 다음 단계 (2단계 이후 예정)
- 커뮤니티 게시판(자유/후기/모집)
- 여러 명 궁합 — 관계 그래프
- 시나리오 DB + 관리자 승인 플로우
- Gemini 연동: 성향 리포트 생성, 시나리오 추천
