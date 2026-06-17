# Slack Bot

OpsPilot은 Slack Events API의 `app_mention` 이벤트를 지원합니다.

## 로컬 시뮬레이션

Slack credential 없이 실행합니다.

```bash
pnpm slack:simulate
```

시뮬레이터는 `seed/slack/app-mention.json`을 읽고 mention text를 질문으로 바꾼 뒤 `/ask`와 같은 Agent workflow를 실행합니다. 결과로 thread reply payload, actor mapping, source, 도구 호출, reply post mode를 출력합니다.

## Endpoint

```txt
POST /slack/events
POST /slack/simulate
```

`/slack/simulate`는 로컬 데모용입니다. signature 검증을 건너뛰지만 RAG 검색, 도구 호출, 답변 저장, Slack reply formatting은 같은 경로를 탑니다.

## 운영 설정

```bash
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_BOT_USER_ID=U...
SLACK_POST_REPLIES=true
```

`SLACK_SIGNING_SECRET`이 있으면 raw body와 `x-slack-signature`를 검증하고 5분보다 오래된 요청을 거부합니다.

현재 데모는 Slack user를 환경 변수 기본값으로 role/team에 매핑합니다. 운영에서는 Slack user id를 내부 user/team/role과 연결해야 합니다.
