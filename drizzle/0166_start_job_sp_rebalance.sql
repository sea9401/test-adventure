-- 직업 해금 SP 체감 산식 전환의 전역 24시간 유예 시작 시각.
-- 기존 행을 덮어쓰지 않아 마이그레이션 재실행으로 유예가 연장되지 않는다.
INSERT INTO "ops_settings" (
	"key",
	"value",
	"updated_by_email",
	"updated_at"
)
VALUES (
	'job-sp-rebalance.v1',
	jsonb_build_object(
		'startedAt',
		floor(extract(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint
	),
	NULL,
	CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
