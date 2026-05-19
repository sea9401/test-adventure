-- 일회성 데이터 백필 — 게시판 제목 필수화(PR #405) 이전에 작성된 빈/null 제목 글의
-- 제목을 본문 첫 줄(최대 50자) 로 채워 둔다. 빈 본문(서버 검증으로 차단) 이라 비어 있을 일은
-- 없지만 만약을 위해 '(제목 없음)' placeholder 로 안전판.
--
-- 백필 후에도 컬럼은 nullable 로 둠 — drizzle-kit generate 가 재생성하지 않도록.
-- 서버 POST 가 empty title 을 차단하니 신규 글은 절대 null 이 되지 않는다.

UPDATE bulletin_posts
SET title = COALESCE(
  NULLIF(
    LEFT(
      trim(split_part(content, E'\n', 1)),
      50
    ),
    ''
  ),
  '(제목 없음)'
)
WHERE title IS NULL OR length(trim(title)) = 0;
