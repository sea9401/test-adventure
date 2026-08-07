# Google Play 등록 체크리스트

기준일: 2026-08-08

이 문서는 무슨무슨게임 Android TWA를 Play Console에 제출할 때 코드 상태와 콘솔 입력을 일치시키기 위한 운영 체크리스트다. 계정 비밀번호, 심사 계정 비밀번호, 키스토어 정보는 이 문서나 Git에 기록하지 않는다.

## 1. 앱 안에서 준비할 항목

- [x] 게시글·댓글·채팅·쪽지·공개 프로필·길드 정보·사용자 채팅방에서 콘텐츠 신고와 사용자 신고를 구분해 접수
- [x] 사용자 차단 및 차단 해제, 차단한 작성자의 게시글·댓글·채팅 숨김
- [x] 차단 관계 사이의 새 쪽지와 채팅방 초대 차단
- [x] 신고 당시 원문·이미지 식별자와 문맥 보존, 중복·과다 신고 제한
- [x] 관리자 신고함, 원본 콘텐츠 삭제, 대상 사용자 제재 화면 연결, 관리자 감사 기록
- [x] 신규 신고 접수 시 개인정보를 제외한 운영 웹훅 알림과 내부 알림 이력 기록
- [x] 최초 캐릭터명부터 프로필 이미지·길드·게시판·채팅 UGC 작성 전 커뮤니티 정책 명시 동의 및 정책 버전·동의 시각 저장
- [x] 앱 안의 회원 탈퇴 기능
- [x] 외부 계정 삭제 안내 URL 운영 반영: `https://msmsge.com/account-deletion` (2026-08-08 운영 HTTP 200 확인)
- [x] 이용약관·운영정책·개인정보처리방침에 신고, 차단, UGC 동의, 신고 기록 보유 기간 반영
- [ ] 실제 기기에서 신고 → 관리자 처리 → 차단 해제 전체 흐름 점검

관련 Google 정책: [사용자 제작 콘텐츠](https://support.google.com/googleplay/android-developer/answer/12923286), [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111)

## 2. 앱 액세스와 심사 계정

- [ ] Play Console의 ‘앱 액세스’에서 로그인이 필요하다고 표시
- [ ] 만료되지 않는 심사 전용 계정과 로그인 절차 입력
- [ ] 심사 계정에 실제 심사에 필요한 게임 상태·권한이 있는지 확인
- [ ] OTP, 지역 제한, 한 기기 세션 제한 등 심사를 막을 조건과 해결 절차 기재
- [ ] 심사 계정 자격 증명은 Play Console에만 입력하고 저장소에는 남기지 않기

관련 안내: [앱 액세스 준비](https://support.google.com/googleplay/android-developer/answer/15748846)

## 3. 데이터 보안 양식

실제 코드와 인프라 설정을 기준으로 답한다. 아래 항목은 최소 검토 대상이며, SDK나 운영 구성이 바뀌면 다시 조사한다.

- [ ] 계정 식별자: OAuth 회원 식별자, 이메일, 게임 닉네임
- [ ] 사용자 콘텐츠: 게시글, 댓글, 채팅, 쪽지, 프로필·길드·문의 이미지
- [ ] 앱 활동: 게임 진행, 전투, 거래, 길드, 신고·차단과 운영 기록
- [ ] 기기 또는 기타 식별자: 활성 세션·푸시 구독 식별값
- [ ] 진단·보안 정보: IP, 요청·오류·이상행동 기록
- [ ] 모든 전송 구간 암호화 여부 확인
- [ ] 계정 삭제 요청 경로와 데이터 삭제 정책 표시
- [ ] 광고·분석 SDK가 실제로 없는지 AAB 기준 재확인
- [ ] 개인정보처리방침 URL을 `https://msmsge.com/privacy`로 입력

관련 안내: [데이터 보안 양식](https://support.google.com/googleplay/android-developer/answer/10787469)

## 4. 콘텐츠 및 대상층

- [ ] 콘텐츠 등급 설문을 게임의 실제 채팅·UGC, 판타지 전투, 사용자 상호작용 기준으로 답변
- [ ] 대상 연령과 아동 대상 여부를 실제 운영 방침과 일치시킴
- [ ] 광고 포함 여부를 실제 빌드와 일치시킴
- [ ] 뉴스·건강·금융·정부·도박 등 해당되는 선언이 없는지 검토

관련 안내: [콘텐츠 등급](https://support.google.com/googleplay/android-developer/answer/9859655)

## 5. 스토어 등록정보와 Android 패키지

- [ ] 앱 이름, 짧은 설명, 전체 설명 최종 교정
- [x] 앱 아이콘 512×512 준비: `android/store_icon.png`
- [x] 그래픽 이미지 1024×500 준비: `android/store-assets/feature-graphic.png`
- [ ] 휴대전화 스크린샷 준비
- [ ] 스크린샷이 현재 UI와 일치하고 로그인 정보·개인정보를 포함하지 않는지 확인
- [ ] 지원 이메일과 웹사이트 입력
- [ ] AAB의 패키지명, versionCode, versionName 확인
- [x] `compileSdk`/`targetSdk` 36 설정
- [x] Play App Signing 인증서 지문을 Digital Asset Links와 TWA 설정에 반영
- [x] `https://msmsge.com/.well-known/assetlinks.json`의 현재 지문을 Play App Signing SHA-256과 대조 (2026-08-04 `Play-signed Android app` 등록 이력 및 운영 응답 일치)
- [x] `android/twa-manifest.json`의 `fingerprints`를 확인된 Play App Signing 지문으로 갱신
- [ ] 내부 테스트 트랙에서 설치, 로그인, 뒤로 가기, 딥링크, 푸시, 파일 업로드 점검

관련 안내: [스토어 등록정보 그래픽 자산](https://support.google.com/googleplay/android-developer/answer/9866151)

## 6. 테스트와 출시 전 최종 확인

- [ ] 신규 개인 개발자 계정에 해당하면 비공개 테스트 참여자 12명·연속 14일 요건 충족 여부 확인
- [ ] 사전 출시 보고서의 충돌, ANR, 접근성, 보안 경고 검토
- [ ] 프로덕션 제출 직전 개인정보처리방침, Data safety, 실제 AAB 동작을 다시 대조
- [ ] 릴리스 노트 작성
- [ ] 제출 후 정책 메일을 받을 연락처 확인

관련 안내: [개인 개발자 계정 테스트 요구사항](https://support.google.com/googleplay/android-developer/answer/14151465)
