-- Custom SQL migration file, put your code below! --

-- [생산재료 개편 PR-3 후속] 슬롯 12h 생산(produce/harvest) 폐지 — 기존 정착지에 남아 있던
--   진행중/완료(수확대기) 생산 작업(jobs)과 칸 종류(slot_kinds)를 일괄 비운다.
--   harvest 라우트가 제거돼 더는 수확/정리가 불가하므로, 남은 jobs 가 "수확 가능" 상태로
--   칸을 영구히 묶는 문제를 해소한다(오너 결정: 그냥 소멸). 슬롯은 "건물 예정" 자리표시로만
--   남고, crop/ore 풀은 사냥 드랍→기부+업그레이드 소비로만 변동한다.
--   🔒 멱등: 이미 빈 값이면 무변(재실행 안전). crop/ore 자원 풀(v2_guild_resources/
--   user_settlement_resources)·unlocked_slots·tier 는 무접촉.
UPDATE outpost_villages
SET jobs = '{}'::jsonb,
    slot_kinds = '{}'::jsonb
WHERE jobs <> '{}'::jsonb
   OR slot_kinds <> '{}'::jsonb;
