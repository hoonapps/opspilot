# 디자인

OpsPilot 웹 콘솔은 Open Design.app에서 잡은 운영 대시보드 콘셉트를 기준으로 구현했습니다.

## 산출물

- `docs/assets/opspilot-dashboard.svg`: README용 정적 제품 미리보기
- `docs/assets/opspilot-web-console.png`: 실제 Next.js 콘솔을 Playwright로 캡처한 화면

PNG는 `pnpm web:smoke`가 실행 중인 API/Web을 대상으로 생성합니다. 따라서 README 이미지는 단순 마케팅 mockup이 아니라 실제 동작 화면의 결과물입니다.

## 화면 구조

- 질문: RAG 답변, 출처, 문서 일치율, trace, proof, 답변 drift
- 검색: retrieval preview, score breakdown, 권한 차단 후보
- 문서: Markdown 등록, GitHub sync, version diff, chunk preview, permission matrix
- 품질: 평가, SLO, 배포 게이트, 운영 지표
- 승인: 사람 승인 queue
- 감사: 도구 registry, 도구 호출 감사, Slack simulator
- 사용법: 로컬 실행과 데모 순서

## 디자인 원칙

운영 도구답게 과한 마케팅 hero보다 반복 작업에 맞는 console UI를 우선했습니다. 모든 핵심 증거는 면접관이 클릭해서 확인할 수 있게 화면별로 분리했습니다.
