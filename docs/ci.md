# 지속적 통합

OpsPilot은 `main` 푸시와 풀 리퀘스트에서 GitHub Actions를 실행합니다.

## 검증 항목

- 고정된 lockfile 기반 설치
- PostgreSQL + pgvector, Redis 서비스 컨테이너 실행
- DB 마이그레이션
- 타입 검사
- 빌드
- 패키지 테스트: `@opspilot/ai`, `@opspilot/rag`, `@opspilot/shared`
- RAG 핵심 계약 테스트: `heading_paragraph_window_v1`, `token_overlap_v1`, `semantic_embedding_v1`
- 공통 패키지 계약 테스트: SHA-256 해시와 인용/가시성 타입
- Jest API 패키지 테스트
- Docker 이미지 빌드
- 프로덕션 compose 스모크
- RAG 평가
- 평가 게이트 실패 경로 스모크
- 평가 이력 스모크
- 평가 회귀 리포트 스모크
- 평가 문서 커버리지 스모크
- 검색 품질 `recall@k`/`MRR`/`nDCG`, 리랭킹 전/후 비교, 리랭킹 개선 fixture 스모크
- OpenAI embedding provider가 문서 색인과 pgvector 검색 경로에 연결되는지 검증하는 스모크
- 로컬/OpenAI/Transformers 임베딩 비교 리포트 스모크
- 어려운 패러프레이즈 문서 세트 기반 의미 검색 스모크
- Transformers embedding provider 선택 실행 스모크
- Transformers embedding provider가 실제 색인/검색 경로에 연결되는지 검증하는 선택 실행 스모크
- 지식 최신성 스모크
- 운영 지표/SLO 스모크
- 운영 액션 플랜 스모크
- API 요청 관측성 스모크
- 배포 게이트 스모크
- 권한 경계 스모크
- 서명된 호출자 토큰 스모크
- 시크릿 마스킹 스모크
- 프롬프트 주입 가드레일 스모크
- 호출자 호출 제한 스모크
- `/ask` 멱등성 스모크
- 준비 상태 스모크
- 문서 일치율 스모크
- 임베딩 기반 문서 일치율 선택 스모크
- Anthropic tool_use 기반 agentic orchestration 스모크
- 런북 체크리스트 도구 호출 스모크
- 장애 대응 플랜 스모크
- 직접 색인 스모크
- URL/txt/PDF/Word 소스 수집, 수집 품질 진단, 문서 초기화 스모크
- 검색 운영 프로파일 스모크
- 검색 강건성 스모크
- 권한별 검색 비교 스모크
- 문서 색인 설명 스모크
- 색인 스냅샷 스모크
- 큐 색인 스모크와 BullMQ 큐 관제 검증
- GitHub 동기화 스모크
- 문서 변경 영향 분석 스모크
- 개별 문서 삭제와 색인 정리 스모크
- 문서 재검증 큐 스모크
- 문서 재검증 실행 스모크
- 평가 케이스 상세 스모크
- 승인 작업 흐름 스모크
- 답변 추적/증명 스모크
- 문장별 근거 검증 스모크
- 답변 변경 감지 스모크
- 답변 증거 번들 스모크
- 답변 계보 그래프 스모크
- 답변 신뢰 게이트 스모크
- 제품 데모/리포트
- 공개 배포 URL 없는 포트폴리오 100점 로컬 증명
- OpenAPI 계약 스모크
- Playwright 웹 스모크

지속적 통합은 “코드가 빌드된다” 수준이 아니라 제품이 주장하는 운영 품질을 검증합니다. 핵심 RAG 패키지의 청킹/문서 일치율 계약, URL/txt/PDF/Word 수집, 근거 기반 검색, 검색 품질 `recall@k`/`MRR`/`nDCG`, 리랭킹 전/후 비교, 잘못된 1위 후보를 리랭커가 교체하는 개선 fixture, OpenAI embedding provider 색인 경로, 로컬/OpenAI/Transformers 임베딩 비교, 어려운 패러프레이즈 평가셋, 임베딩 기반 답변-출처 일치율 선택 경로, Anthropic `tool_use` 루프와 도구 감사/승인 trace, 인용 정확도, 평가 회귀 리포트, 평가 문서 커버리지, 검색 운영 프로파일, 검색 강건성, 권한별 검색 비교, 문서 색인 설명, 색인 스냅샷, 문서 일치율, 문장별 근거 검증, 문서 변경 영향 분석, 개별 문서 삭제와 색인 정리, 답변 신뢰 게이트, 권한 경계, 사람 승인, 도구 감사, 런북 기반 장애 대응 플랜, API 요청 관측성, 운영 액션 플랜, BullMQ 색인 큐 관제, `/ask` 멱등성, Slack 시뮬레이터, 평가 최신성, 배포 게이트, 공개 URL 없는 포트폴리오 100점 게이트, 웹 콘솔 흐름이 모두 깨지면 실패하도록 구성했습니다.
