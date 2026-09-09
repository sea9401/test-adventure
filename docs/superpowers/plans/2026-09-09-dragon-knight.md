# 용기사 구현 계획

Superpowers 계획·TDD·직접 검토 절차를 현재 브랜치에서 연속 실행한다. 사용자 지침에 따라 서브에이전트와 추가 승인 단계는 생략한다.

- [x] `dragonKnight.test.ts`: 부모 숙련도 AND 경계, 저장 복원/학습/수행, 범용 및 계열 패시브 회귀 작성 후 실패 확인.
- [x] `lineagePassives.ts`: 소규모 공통 계열 보너스 타입·합산 함수를 만들고 성기사 보너스 메타를 이전한다. 기존 성기사 테스트로 효과·SP 보존 검증.
- [x] `v2JobCatalog.ts`, `proficiency.ts`, `v2SkillsByJob.ts`, `dragonKnightSkills.ts`: 4직업·8스킬, 성장·계보·패턴·상세 설명 연결.
- [x] 공용 실제 시전 및 PvE/PvP 검사로 관통/포효/지연/활력 브레스를 검증한다. 직업 수 및 SP 총합 기대값을 변경된 직업 수로 갱신한다.
- [x] 관련 테스트, 타입 검사(6GB), ESLint, 모듈 크기 및 diff 검토 후 이 변경만 커밋한다.
