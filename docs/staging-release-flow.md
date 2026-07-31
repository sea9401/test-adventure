# 스테이징·운영 출시 흐름

## 평소 개발

1. `staging`에서 기능 브랜치를 만든다.
2. 기능 PR의 대상 브랜치를 `staging`으로 지정한다.
3. CI 통과 후 **Squash and merge**한다. 기능 하나가 staging 커밋 하나가 된다.
4. staging CI가 다시 통과하면 같은 SHA가 `test.msmsge.com`에 자동 배포된다.
5. 테스트 서버에서 실제 플레이로 확인하고, 수정은 다시 기능 PR로 반복한다.

스테이징은 운영과 별도 DB(`staging_coreloop`)·별도 DB 역할
(`adventure_staging`)·별도 인증/cron 비밀값을 사용한다. 운영 Discord 웹훅과 운영 백업,
운영 R2 버킷은 연결하지 않는다. staging 전용 R2 버킷이 준비되기 전까지 이미지 업로드
기능은 테스트 서버에서 비활성 상태다.

## 정기 업데이트

1. 출시할 staging 상태를 마지막으로 플레이 검증한다.
2. `staging → main` PR을 만들고 변경 목록을 확인한다.
3. main CI가 통과한 뒤 PR을 머지한다.
4. GitHub Actions의 **Deploy to EC2**를 수동 실행한다.
5. `deploy_sha`에는 방금 CI를 통과한 main의 전체 40자리 SHA를 넣는다.
6. 운영 상태·로그인·배포 smoke가 모두 통과했는지 확인한다.

main push만으로 운영 배포는 시작되지 않는다. 정해진 업데이트 시간에는 4번의 수동
실행만 하면 되고, 그 전까지의 개발과 플레이 검증은 staging에서 계속할 수 있다.

## 긴급 중단

테스트 서버를 외부에서 즉시 닫아야 하면 EC2에서 아래 명령을 실행한다.

```bash
cd ~/adventure-rpg-test
bash deploy/apply-test-site-closed.sh
```

앱과 staging DB는 유지되고 nginx만 정적 503 안내로 전환된다.
