-- Catch up existing attackers once when switching to the inclusive reward policy.
-- Production stops the old runtime before migrations; Drizzle's migration journal
-- prevents reapplying this grant. Do not execute this SQL manually after deployment.
-- Each old attack paid all then-registered attackers for its new clears. Only
-- stages cleared BEFORE a user's first attack are missing. Stage progression is
-- monotonic; MIN is reliable even when transaction timestamps are out of order.
WITH missing_rewards AS (
  SELECT p.user_id,
    MIN((a.result->>'stage')::integer - (a.result->>'stagesCleared')::integer - 1) AS stages
  FROM chuseok_participants p
  JOIN chuseok_attacks a ON a.event_id = p.event_id AND a.user_id = p.user_id
  WHERE p.event_id = 'chuseok-2026' AND p.attack_count > 0
  GROUP BY p.user_id
  HAVING MIN((a.result->>'stage')::integer - (a.result->>'stagesCleared')::integer - 1) > 0
)
INSERT INTO marketplace_inbox (user_id, kind, payload, message)
SELECT user_id, 'admin_gift',
  jsonb_build_object(
    'gold', 0, 'materials', '[]'::jsonb, 'items', '[]'::jsonb,
    'staminaPotions', stages * 15, 'museunCoins', 0,
    'cashItems', '[]'::jsonb, 'adventureSupportDays', 0
  ),
  '추석 복주머니 참여 전 1~' || stages || '단계 보상: 스태미나 회복약 ' || (stages * 15) || '개'
FROM missing_rewards;
