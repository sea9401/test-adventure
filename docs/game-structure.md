# 게임 구조도 (v2)

로그인 → 캐릭터 생성 → 6탭 허브 구조. 핵심은 "전투 → 보상 → 성장 → 더 강한 전투" 루프.

```mermaid
flowchart TD
    %% ===== 진입 / 온보딩 =====
    SignIn["🔑 로그인<br/>소셜 OAuth"] --> Gate{온보딩<br/>완료?}
    Gate -- 미완료 --> Create["🧙 캐릭터 생성<br/>이름·외형 → 직업·속성"]
    Create --> Hub
    Gate -- 완료 --> Hub

    Hub(["🎮 게임 허브<br/>상단바 · 스태미나 · 6탭"])
    Hub --> Adv & Bat & Town & Char & Guild & Plaza

    %% ===== 모험 =====
    subgraph S1["🗺️ 모험"]
        Adv["거점 홈<br/>캐릭 카드 + 현 거점"] --> Enter["거점 진입"]
    end

    %% ===== 전투 =====
    subgraph S2["⚔️ 전투"]
        Bat["전투 홈"] --> Dungeon["사냥터<br/>층별 입장"]
        Bat --> Map["지도<br/>거점 이동"]
        Bat --> Arena["아레나<br/>1:1 PvP 단판"]
        Dungeon --> Combat["자동 단판 전투"]
        Combat --> Reward["보상<br/>골드 · EXP · 재료 · 드랍"]
        Map --> Claim["거점 점령 / 축출<br/>영토 PvP · 통행정책"]
    end

    %% ===== 마을 =====
    subgraph S3["🏘️ 마을"]
        Town["마을 홈"] --> Heal["치료소<br/>골드로 HP 회복"]
        Town --> Shop["상점<br/>장비 · 재료 · 골드충전"]
        Town --> Shrine["성장의 신전<br/>스탯/숙련 초기화"]
        Town --> Train["훈련장<br/>수행(cap↑) · 대련"]
        Town --> Smithy["대장간<br/>제작 · 강화 · 부여 · 분해"]
        Town --> Fish["낚시터<br/>미니게임 · 주간대회"]
        Town --> Treasure["발굴 감정소<br/>골동품 발굴 · 도감"]
    end

    %% ===== 캐릭터 =====
    subgraph S4["👤 캐릭터"]
        Char["캐릭터 홈"] --> Info["내 정보<br/>스탯 · 숙련도 · 전직 · 스킬"]
        Char --> Inv["인벤토리<br/>장비 6슬롯 장착"]
        Char --> Codex["모험의 서<br/>도감"]
    end

    %% ===== 길드 =====
    subgraph S5["🏰 길드"]
        Guild["길드 홈<br/>창단 / 가입"] --> GQuest["길드 의뢰<br/>주간 사이클"]
        Guild --> Lodge["회관 · 금고"]
        Guild --> Buffs["길드 버프"]
        Guild --> Lineup["거점 수비 라인업"]
    end

    %% ===== 광장 =====
    subgraph S6["📢 광장"]
        Plaza["광장 홈"] --> Bulletin["게시판"]
        Plaza --> Rank["랭킹"]
        Plaza --> Feed["전체 소식"]
    end

    %% ===== 핵심 성장 루프 =====
    Reward -.재료.-> Smithy
    Reward -.골드 소비.-> Heal
    Smithy -.강화된 장비.-> Inv
    Inv -.전투력 ↑.-> Combat
    Enter -.사냥터 연결.-> Dungeon
```

## 구조 요약

- **진입 흐름**: 로그인(OAuth) → 온보딩 게이트(`OnboardingGate`)가 프로필+직업 미설정 시 `/create`로 보냄 → 캐릭터 생성 후 허브(`/`)로.
- **허브**: `(game)` 라우트 그룹 공유 레이아웃. `GameChrome`이 상단바·스태미나·배경·6탭을 항상 유지(페이지 전환에도 상태 보존).
- **6 메인 탭**: 모험 / 전투 / 마을 / 캐릭터 / 길드 / 광장.
- **핵심 루프(점선)**: 전투 → 골드·EXP·재료 → (치료소에서 골드로 HP회복 + 대장간에서 재료로 제작·강화) → 장비 장착 → 전투력↑ → 더 강한 전투. 골드가 HP 회복 통화로 이중 역할을 하는 게 이 경제의 축.
