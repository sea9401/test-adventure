-- Custom SQL migration file, put your code below! --

-- 타일 점령행 길드 = 소유자의 현재 길드 동기화(기존 데이터). "타일=소유자 따라감" 통일 모델로,
-- 멤버십 변경 훅(가입=길드 전환·탈퇴=솔로 복귀)이 앞으로 유지하는 불변을 기존 행에 소급 적용한다.
--   대상: tile id 점령행(카탈로그 정적 거점은 옛 시맨틱이라 제외).
--   설정: occupied_by_guild_id = 소유자(occupied_by_user_id)의 현재 guild_members.guild_id,
--         소유자가 무소속이면 NULL(솔로). → 지도 소프트링크(소유자→길드)와 항상 일치하게 됨.
--   효과: ① 솔로로 짓고 길드 가입한 타일 → 길드 영지화(공동 수비 가능). ② 정복 후 정복자가
--         길드를 떠난 타일 → 솔로 복귀(소유자 따라감). 멱등(재실행 시 같은 값).
--   ⚠️ 솔로 복귀하는 행의 옛 길드 수비큐/영주/금고는 런타임 정정(읽기 시 길드 필터)이라 여기선
--      occupied_by_guild_id 만 맞춘다(고아 금고는 드문 엣지·런타임 revert 헬퍼가 향후 처리).
UPDATE outpost_occupations o
SET occupied_by_guild_id = (
  SELECT gm.guild_id
  FROM guild_members gm
  WHERE gm.user_id = o.occupied_by_user_id
  LIMIT 1
)
WHERE o.outpost_id LIKE 'tile:%'
  AND o.occupied_by_user_id IS NOT NULL;
