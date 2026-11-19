# 사람 줄 프사 (줄 머리 식별 그림 1단계)

## 배경

건의 #870 "채팅창이나 길드목록에 프사 추가 가능한가요?"를 계기로 2026-11-20 오너가 게임 전반의
디자인 방향을 정했다.

- 지금 화면은 글자만 많아 훑어 읽기 어렵다. 다만 글 위주 구조는 몰래 웹·모바일로 하는 사람에게
  장점이므로 최대한 유지한다.
- lunes는 느낌의 예시일 뿐이고 그 디자인을 가져오지 않는다. 큰 배너, 장식 테두리, 사이드바 배치는
  하지 않는다.
- 그림은 **줄 맨 앞의 작은 식별 그림**으로만 쓴다. 사람은 프사, 물건은 장비 종류 그림, 장소·메뉴는
  시설 그림이다.
- 새로 넣는 그림은 은신 모드와 터미널 모드에서 나오지 않는다.
- 대상별로 나눠 순서대로 진행한다: 사람 → 물건 → 메뉴 → 글자 위계 정리. 이 문서는 첫 단계다.

시안: https://claude.ai/artifact/UibV7UijUbU2r7ziNr3UjY (오너가 채팅은 "메시지마다 프사" 안을 골랐다.)

## 지금 상태

- 프사 체계는 이미 있다. 외형 6종, NPC·몬스터 그림, 직접 올린 그림, 프로필 테두리 꾸미기
  (`CosmeticAvatar`, `avatars.ts`).
- 랭킹, 아레나, 게시판, 협동 보스 기록, 길드원 탭 조직도에는 프사가 나온다.
- 채팅 메시지, 채팅방 참여자, 길드 기여도, 제작 기여도, 토벌전 길드원 기여도, 장인 순위에는 이름만
  나온다.
- 서버에는 여러 사람의 프사를 한 번에 읽는 `readProfileAvatarMap`과 꾸미기를 읽는
  `readMuseunCosmeticAppearanceMap`이 있다(`src/lib/server/museunCosmetics.ts`).

## 설계

### 1. 공용 부품

`src/components/ui/PersonThumb.tsx`

- `PersonThumb`: 줄 머리 프사. `CosmeticAvatar`를 감싸 크기와 모서리를 고정한다.
  - `size="chat"` 32px, `size="list"` 28px(기본).
  - 훅 클래스 `ui-row-thumb`를 단다. 이후 물건·메뉴 단계의 줄 머리 그림도 같은 클래스를 쓴다.
  - 테두리 꾸미기는 `CosmeticAvatar`의 정적 테두리(색 테두리, 움직임 없음)로 보인다.
- `PersonLabel`: 프사와 이름을 한 줄로 놓는 묶음. 이름 뒤 보조 정보는 `children`으로 받는다.
  이름이 길면 말줄임한다.

규칙: 사람 이름이 줄로 나오는 곳은 `PersonThumb`를 줄 맨 앞에 둔다. 이름의 동작(프로필 열기)은
각 화면이 쓰던 것을 그대로 둔다.

### 2. 은신 모드와 터미널 모드

`globals.css`에서 `html.ui-discreet-mode .ui-row-thumb`, `html.ui-terminal-mode .ui-row-thumb`를
`display: none`으로 숨긴다. 프사는 flex 줄의 한 칸이라 숨기면 간격도 함께 사라져 지금 화면과 같아진다.
이미 프사가 나오던 화면(`CosmeticAvatar`를 직접 쓰는 곳)은 바꾸지 않는다.

### 3. 채팅

- 서버 `GET /api/chat`(주 채널 묶음 조회, 단일 채널·채팅방 조회)와 `POST /api/chat` 응답의 메시지에
  `avatar`를 더한다. 작성자 묶음으로 `readProfileAvatarMap`을 꾸미기 조회와 함께 한 번 호출한다.
  새 메시지가 없는 증분 조회는 작성자가 없어 추가 조회가 없다.
- `ChatMessage` 타입에 `avatar?: Avatar | null`. 테두리는 이미 내려오는 `cosmetics.profileBorder`를 쓴다.
- 보내는 중인 내 메시지(임시 메시지)는 내 프사를 써서 전송 전후로 줄이 흔들리지 않게 한다
  (`GameChrome` → `ChatButton` → `ChatPanel`로 `avatar` 전달).
- `MessageList`: 일반 메시지는 왼쪽 32px 프사, 오른쪽에 지금의 두 줄(칭호·이름·시각 / 본문)을 그대로
  둔다. 알림 탭의 시스템 알림은 지금처럼 프사 없이 한 줄이다.
- 남의 메시지의 프사를 누르면 이름을 누를 때와 같이 프로필이 열린다. 같은 동작의 버튼이 두 개가 되지
  않도록 프사 버튼은 탭 순서와 보조 기술에서 뺀다(이름 버튼이 그 역할을 한다).
- 채팅방 참여자 목록: `GET /api/chat/rooms/[roomId]` 응답의 참여자에 `avatar`, `profileBorder`를 더하고
  이름 앞에 28px 프사를 둔다.

### 4. 길드 목록

- 길드 기여도(`GuildContributionPanel`), 제작 기여도(`GuildArtisanContributionPanel`): 길드 정보의
  길드원에 `avatar`, `profileBorder`가 이미 있어 화면만 고친다.
- 토벌전 길드원 기여도(`GuildRaidPanel`): 서버 `guildRaidRead`의 `members`에 `avatar`,
  `profileBorder`를 더한다.
- 장인 순위(`ArtisanLeaderboardPanel`): 서버가 이미 읽는 프로필 세이브에서 `avatar`를 꺼내고 꾸미기를
  한 번 더 읽어 `profileBorder`를 더한다.

### 5. 규칙 문서

`.claude/skills/anti-slop-ui/SKILL.md`의 부품 표에 "사람이 나오는 줄 → `PersonThumb`"와 줄 머리 그림
규격(줄 맨 앞, 28·32px, 은신·터미널 모드에서 숨김)을 더한다.

## 범위 밖

- 낚시 대회 순위·명예의 전당, 우편 보낸 사람, 협동 보스 일부 목록, 길드 활동·창고 기록, 토벌전 최근
  전투 기록. 같은 부품으로 다음 묶음에서 한다.
- 물건(장비 종류 그림), 메뉴(시설 그림), 글자 위계 정리.
- 배포.

## 검증

- 단위 테스트: `PersonThumb`(크기, 훅 클래스, 테두리 전달), 채팅 서버 응답의 `avatar`, 채팅방 참여자
  응답, 토벌전·장인 순위 응답, `MessageList`(일반 메시지에는 프사, 알림에는 없음), 은신·터미널 모드
  숨김 규칙이 `globals.css`에 있는지.
- 로컬 로그인 환경에서 채팅과 길드 화면을 390px·1280px, 라이트·다크, 클래식·금빛, 은신 모드로 캡처.
- 전체 테스트, 타입 검사, lint, 빌드.

## 구현 순서

1. `PersonThumb`·`PersonLabel`과 CSS 규칙(테스트 먼저).
2. 채팅 서버 응답과 타입, `MessageList`, 임시 메시지의 내 프사.
3. 채팅방 참여자(서버·화면).
4. 길드 기여도·제작 기여도(화면), 토벌전 길드원 기여도·장인 순위(서버·화면).
5. 규칙 문서, `/dev/ui-system` 미리보기에 예시 추가.
6. 화면 캡처 확인과 전체 검증.
