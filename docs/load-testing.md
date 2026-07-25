# 안전 부하 테스트

이 도구는 로컬 또는 운영 DB와 분리된 스테이징에서만 사용한다. `msmsge.com`과
`www.msmsge.com`은 기본 차단되며, 운영 서버의 한계를 알아보기 위한 부하 테스트는
하지 않는다.

```bash
# 로컬 health: 10초 동안 초당 20회, 동시 10개
npm run load-test -- --url http://127.0.0.1:3000 --path /api/health \
  --duration 10 --rate 20 --concurrency 10 --max-p95 1000

# Nginx가 포함된 스테이징에서 429도 의도한 정상 응답으로 집계
npm run load-test -- --url https://staging.example.com --path /api/v2/example \
  --duration 30 --rate 100 --concurrency 30 --ok-status 200-299,429
```

인증 API는 별도 테스트 계정의 쿠키만 `LOAD_TEST_COOKIE`에 넣는다. 쓰기 API는
복구 가능한 전용 DB에서만 실행하고 JSON 본문은 `LOAD_TEST_BODY`로 넘긴다.

판정 지표는 처리량, 상태 코드별 횟수, 네트워크 오류, p50/p95/p99 지연이다. 기본
실패 허용률은 1%, p95 상한은 1초다. Nginx 제한 검증에서는 429를 정상 상태에
포함하되, 500/502/503과 타임아웃이 생기지 않는지를 본다.
