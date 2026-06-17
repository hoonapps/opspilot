---
title: "Redis 장애 런북"
visibility: team
teamSlug: platform
tags: redis,incident,runbook
---

# Redis 장애 런북

## 메모리 사용량 증가

Redis 사용 메모리가 10분 동안 85%를 넘으면 심각 상태로 판단합니다.
키를 삭제하기 전에 top keys 리포트를 먼저 확인합니다.
사용자 세션 키가 정상적으로 증가 중이면 캐시 노드 증설을 검토합니다.

## 연결 수 급증

배포 이후 연결 수가 급증하면 API connection pool 설정을 확인합니다.
5분 안에 연결 수가 떨어지지 않으면 배포 롤백을 검토합니다.

## 민감 작업

운영 Redis 키 삭제는 장애 지휘자가 장애 스레드에서 명시적으로 승인하지 않는 한 사람 승인이 필요합니다.
