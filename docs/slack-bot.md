# Slack 봇

OpsPilot은 Slack Events API의 `app_mention` 이벤트를 지원합니다.

## 로컬 시뮬레이션

Slack 인증 정보 없이 실행합니다.

```bash
pnpm slack:simulate
```

시뮬레이터는 `seed/slack/app-mention.json`을 읽고 멘션 텍스트를 질문으로 바꾼 뒤 `/ask`와 같은 에이전트 작업 흐름을 실행합니다. 결과로 스레드 답변 페이로드, 호출자 매핑, 출처, 도구 호출, 답변 전송 모드를 출력합니다.

## 엔드포인트

```txt
POST /slack/events
POST /slack/simulate
```

`/slack/simulate`는 로컬 데모용입니다. 서명 검증을 건너뛰지만 RAG 검색, 도구 호출, 답변 저장, Slack 답변 포맷팅은 같은 경로를 탑니다.

## 운영 설정

```bash
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_BOT_USER_ID=U...
SLACK_POST_REPLIES=true
```

`SLACK_SIGNING_SECRET`이 있으면 원본 본문과 `x-slack-signature`를 검증하고 5분보다 오래된 요청을 거부합니다.

현재 데모는 Slack 사용자를 환경 변수 기본값으로 역할/팀에 매핑합니다. 운영에서는 Slack 사용자 ID를 내부 사용자/팀/역할과 연결해야 합니다.
