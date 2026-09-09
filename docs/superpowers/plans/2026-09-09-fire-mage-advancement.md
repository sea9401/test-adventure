# 화염 5·6차 구현 계획

사용자 작업 지침에 따라 현재 브랜치에서 직접 진행한다. 서브에이전트·추가 승인·배포 없이 요청된 직업 추가만 수행한다.

- [x] fireMageAdvancement.test.ts로 전직 경계·저장·교관·수행·패시브를 검증하고 신규 직업 부재 실패를 확인한다.
- [x] v2JobCatalog.ts, v2SkillsByJob.ts, v2Skills.ts를 연결하고 별도 fireMageSkills.ts에 스킬4개를 정의한다.
- [x] 실제 시전·PvE/PvP를 확인하고 직업수149와 SP해금 기대값을 갱신한다.
- [x] 데이터·전투 회귀, 타입·린트·모듈 한도·diff를 확인하고 관련 파일만 커밋한다.
