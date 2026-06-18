---
title: E102 payment.approval.timeout rollback 기준
visibility: public
tags: payment,incident,rerank
---

# E102 payment.approval.timeout rollback 기준

최신 운영 runbook입니다.

승인 타임아웃 장애가 발생하면 결제 승인 지표를 먼저 확인합니다.
rollback 기준은 5분 연속 실패율 3% 이상이거나 p95 지연이 2500ms를 넘는 경우입니다.
롤백 후에는 결제 승인 재시도 큐와 고객 공지 상태를 함께 확인합니다.
