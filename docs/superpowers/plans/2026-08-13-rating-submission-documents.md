# 등급분류 첨부문서 제작 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임콘텐츠등급분류위원회 첨부문서 화면에 제출할 공개용 PDF, 비공개 ZIP, 게임파일 전달방법 TXT를 사용자 PC 바탕화면에 생성한다.

**Architecture:** 프로젝트의 공개 게임 설명과 사용자가 촬영한 실제 진행 영상을 근거로 임시 HTML 문서를 만들고 Chromium 인쇄 기능으로 PDF를 생성한다. 비공개 자료는 UTF-8 TXT 문서만 포함한 ZIP으로 분리하며, 실제 자격 증명은 복제하지 않고 신청서 기재 계정과 동일하다고 안내한다.

**Tech Stack:** Bash, Node.js, Playwright Chromium, HTML/CSS, ZIP, UTF-8 text

## Global Constraints

- 최종 결과물은 `/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813`에 저장한다.
- 공개 설명서에는 계정 정보, 관리자 정보, 소스 코드, 세션 값, 다른 이용자의 식별 정보를 넣지 않는다.
- 비공개 자료에도 실제 아이디·비밀번호·개인정보·운영 비밀값을 새로 복제하지 않는다.
- 무슨 코인 상점은 화면만 공개된 비활성 기능이며 실제 구매·충전·결제가 되지 않는다고 명시한다.
- 프로젝트 코드와 운영 환경은 변경하지 않고 배포하지 않는다.

---

### Task 1: 실제 자료 수집과 영상 프레임 추출

**Files:**
- Read: `docs/grac-exemption-precheck-package.md`
- Read: `src/app/manual/content/*.tsx`
- Read: `/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_주요진행영상_20260813.mp4`
- Create: `/tmp/rating-submission-20260813/extract-frames.mjs`
- Create: `/tmp/rating-submission-20260813/frames/*.png`

**Interfaces:**
- Consumes: 사용자가 촬영한 MP4와 프로젝트의 현재 공개 게임 설명
- Produces: 제목, 캐릭터, 사냥, 강화, 협동 보스, 아레나, 채팅, 게시판, 설정, 상점 장면 PNG

- [ ] **Step 1: Playwright Chromium 실행 가능 여부를 확인한다**

Run: `node -e "const { chromium } = require('playwright'); console.log(chromium.executablePath())"`

Expected: 존재하는 Chromium 실행 파일 경로 출력

- [ ] **Step 2: 영상의 지정 시각을 캡처하는 임시 스크립트를 작성한다**

스크립트는 로컬 MP4를 `<video>` 요소로 열고 `loadedmetadata` 후 5초, 35초, 80초,
115초, 175초, 235초, 295초, 330초, 375초, 410초로 이동하여 영상 영역을 PNG로
저장한다. 각 이동은 `seeked` 이벤트 완료 뒤 캡처한다.

- [ ] **Step 3: 프레임을 추출하고 육안 검토한다**

Run: `node /tmp/rating-submission-20260813/extract-frames.mjs`

Expected: `/tmp/rating-submission-20260813/frames`에 10개 PNG 생성

- [ ] **Step 4: 개인정보나 빈 화면이 있는 프레임을 제외한다**

Run: `file /tmp/rating-submission-20260813/frames/*.png`

Expected: 남은 파일이 모두 PNG 이미지이며 실제 게임 장면을 담음

### Task 2: 공개용 게임 사용설명서 PDF 생성

**Files:**
- Create: `/tmp/rating-submission-20260813/01-game-manual.html`
- Create: `/tmp/rating-submission-20260813/render-pdf.mjs`
- Create: `/tmp/rating-submission-20260813/01_무슨무슨게임_게임사용설명서.pdf`

**Interfaces:**
- Consumes: Task 1의 검수된 PNG와 프로젝트의 게임 설명
- Produces: 첨부 화면의 `게임 사용설명서`에 올릴 공개용 PDF 한 개

- [ ] **Step 1: 공개 설명서 HTML을 작성한다**

다음 절을 순서대로 포함한다: 기본정보, 줄거리와 목적, 주요 캐릭터·직업·NPC,
주요 아이템과 재화, 제작·조합·강화, 설치·로그인·조작법, 사냥과 전투, 협동 보스,
아레나, 생활 콘텐츠, 채팅·게시판·신고·차단, 가격·결제·무슨 코인 상점 상태,
주요 장면 스크린샷, 영상 시간정보.

- [ ] **Step 2: 공개 정보 검사를 실행한다**

Run: `rg -n -i "password|비밀번호|010-|@|secret|token|session|관리자 계정" /tmp/rating-submission-20260813/01-game-manual.html`

Expected: 민감정보 발견 없음. 문맥상 필요한 일반 설명이 탐지되면 실제 자격 증명이 아닌지 수동 확인

- [ ] **Step 3: Chromium으로 A4 PDF를 생성한다**

Run: `node /tmp/rating-submission-20260813/render-pdf.mjs`

Expected: PDF 헤더 `%PDF-`를 가진 비어 있지 않은 파일 생성

- [ ] **Step 4: PDF 페이지를 이미지로 다시 열어 첫 페이지와 주요 이미지 배치를 확인한다**

Run: `file /tmp/rating-submission-20260813/01_무슨무슨게임_게임사용설명서.pdf`

Expected: PDF document로 인식되고 파일 크기가 100KB 이상

### Task 3: 비공개 자료 ZIP과 전달방법 TXT 생성

**Files:**
- Create: `/tmp/rating-submission-20260813/private/01_심의용_접속정보.txt`
- Create: `/tmp/rating-submission-20260813/private/02_주요대사_및_스크립트_안내.txt`
- Create: `/tmp/rating-submission-20260813/private/03_Cheat코드_및_개발정보_안내.txt`
- Create: `/tmp/rating-submission-20260813/02_무슨무슨게임_비공개자료.zip`
- Create: `/tmp/rating-submission-20260813/03_게임파일_전달방법.txt`

**Interfaces:**
- Consumes: 서비스 URL과 사용자가 이미 신청서에 제출한 일반 심의용 계정
- Produces: 비공개 자료 업로드용 ZIP과 사이트 입력용 TXT

- [ ] **Step 1: 접속정보 문서를 작성한다**

`https://msmsge.com`, 웹브라우저 접속, Chrome·Edge 권장, 별도 설치 없음,
신청서 기재 심의용 계정과 동일, OTP·휴대전화 인증·결제·구독 없음, 일반 계정이라
아레나 이용 가능을 명시한다.

- [ ] **Step 2: 주요 대사·스크립트 안내를 작성한다**

게임은 음성 대사보다 UI 문구와 전투 로그 중심이며, 주요 NPC 안내·전투·강화·생활·상점·
커뮤니티 문구의 성격과 이용자 작성 채팅·게시판이 사전 제작 대사가 아님을 구분한다.

- [ ] **Step 3: Cheat 코드와 개발정보 안내를 작성한다**

일반 이용자용 Cheat key·Cheat code 없음, 소스 코드 제출 없음, 별도 클라이언트 없음,
심의용 기능 접근은 신청서 계정으로 가능하다고 명시한다.

- [ ] **Step 4: ZIP을 만들고 내부 목록을 검증한다**

Run: `cd /tmp/rating-submission-20260813/private && zip -X ../02_무슨무슨게임_비공개자료.zip *.txt && unzip -t ../02_무슨무슨게임_비공개자료.zip`

Expected: 3개 TXT가 포함되고 `No errors detected` 출력

- [ ] **Step 5: 게임파일 전달방법 TXT를 작성한다**

웹브라우저 접속형 온라인 게임이라 별도 설치형 클라이언트가 없고, URL과 심의용 계정은
신청서·비공개 자료를 참조하며 Chrome 또는 Edge에서 실행한다는 붙여넣기 문구를 작성한다.

### Task 4: 최종 바탕화면 배치와 검증

**Files:**
- Create: `/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813/01_무슨무슨게임_게임사용설명서.pdf`
- Create: `/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813/02_무슨무슨게임_비공개자료.zip`
- Create: `/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813/03_게임파일_전달방법.txt`

**Interfaces:**
- Consumes: Tasks 2~3의 검증된 결과물
- Produces: 사용자가 사이트에 업로드할 최종 폴더

- [ ] **Step 1: 명시된 바탕화면 폴더를 만들고 최종 파일만 복사한다**

Run: `install -d '/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813'` 후 세 파일을 명시적 경로로 복사

Expected: 최종 폴더에 PDF, ZIP, TXT 각 한 개만 존재

- [ ] **Step 2: 파일 형식과 크기를 확인한다**

Run: `file '/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813'/* && ls -lh '/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813'`

Expected: PDF, ZIP, UTF-8 text로 인식되고 모두 0바이트보다 큼

- [ ] **Step 3: 비공개 ZIP과 공개 PDF를 마지막으로 검증한다**

Run: `unzip -t '/mnt/c/Users/sea94/OneDrive/바탕 화면/무슨무슨게임_등급분류_제출자료_20260813/02_무슨무슨게임_비공개자료.zip'`

Expected: 압축 오류 없음. 공개 PDF의 문자열 검사에서 실제 계정·비밀번호·개인정보 발견 없음

- [ ] **Step 4: 프로젝트 작업 트리를 확인한다**

Run: `git status --short`

Expected: 설계·계획 문서 외 프로젝트 코드 변경 없음
