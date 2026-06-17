# 디자인

OpsPilot 웹 콘솔은 Open Design.app에서 잡은 운영 대시보드 콘셉트를 기준으로 구현했습니다.

## 산출물

- `docs/assets/opspilot-dashboard.svg`: README용 정적 제품 미리보기
- `docs/assets/opspilot-web-console.png`: 실제 Next.js 콘솔을 Playwright로 캡처한 화면
- `docs/assets/opspilot-retrieval-lab.png`: 후보별 랭킹 설명과 검색 실행 계획을 보여주는 RAG 검색 실험실 화면
- `docs/assets/opspilot-index-quality.png`: 문서별 색인 품질 게이트와 청크/버전/헤딩 점검 화면
- `docs/assets/opspilot-incident-plan.png`: 런북 기반 장애 대응 플랜과 사람 승인 경계 화면
- `docs/assets/opspilot-portfolio-readiness.png`: RAG, 권한, 도구 호출, 운영성, 데모 산출물을 서버 집계로 보여주는 포트폴리오 증거 보드
- `docs/assets/opspilot-answer-grounding.png`: 답변 토큰 커버리지와 출처별 근거 스니펫 화면
- `docs/assets/opspilot-usage-page.png`: 로컬 실행, 문서 색인, RAG 검증 순서를 정리한 사용법 페이지

PNG는 `pnpm web:smoke`가 실행 중인 API/웹을 대상으로 생성합니다. 따라서 README 이미지는 단순 마케팅 목업이 아니라 실제 동작 화면의 결과물입니다.

## 화면 구조

- 질문: RAG 답변, 출처, 문서 일치율, 근거 스니펫, 추적, 증명, 답변 변경 감지
- 검색: 검색 미리보기, 후보별 랭킹 설명, 점수 분해, 권한 차단 후보
- 대응: SEV 심각도, 단계별 런북 조치, 승인 게이트, 커뮤니케이션, 복구 검증
- 문서: Markdown 등록, GitHub 동기화, 색인 품질 리포트, 버전 변경 차이, 청크 미리보기, 권한 매트릭스
- 품질: 평가, SLO, 배포 게이트, 운영 지표
- 승인: 사람 승인 대기열
- 감사: 도구 레지스트리, 도구 호출 감사, Slack 시뮬레이터
- 사용법: 로컬 실행과 데모 순서

## 디자인 원칙

운영 도구답게 과한 마케팅 히어로보다 반복 작업에 맞는 콘솔 UI를 우선했습니다. 모든 핵심 증거는 면접관이 클릭해서 확인할 수 있게 화면별로 분리했습니다.
