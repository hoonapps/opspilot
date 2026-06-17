---
title: "정산 배치 지연 런북"
visibility: team
teamSlug: payments
tags: settlement,batch,runbook
---

# 정산 배치 지연 런북

## 증상

`settlement.batch.completed_at`이 예정 시각보다 30분 이상 늦으면 정산 배치 지연으로 판단합니다.
일반적인 고객 영향은 가맹점 정산 예정 금액 노출 지연입니다.

## 체크리스트

검색 별칭: 정산 배치 지연, 정산 30분 지연, 정산 체크리스트, 배치 지연 대응.
1. `settlement-worker` 큐 깊이를 확인합니다.
2. `settlement.dlq.count` 값을 확인합니다.
3. 최신 은행 파일이 정상 다운로드됐는지 확인합니다.
4. DLQ 건수가 100을 넘으면 정산 재시도 작업 일시정지를 검토합니다.
5. `#payments-oncall`에 알리고 장애 요약을 작성합니다.

## 복구

은행 파일 재처리가 끝나면 정산 대사 리포트를 실행합니다.
payments 리드 승인 없이 가맹점 잔액을 수동 변경하지 않습니다.
