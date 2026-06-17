---
title: "운영 데이터베이스 접근 정책"
visibility: restricted
tags: security,database,approval
---

# 운영 데이터베이스 접근 정책

## 접근 규칙

운영 데이터베이스 직접 쓰기는 제한됩니다.
`ops_admin` 또는 `security_admin`만 운영 쓰기 승인을 요청할 수 있습니다.

## 승인 필요

검색 별칭: 운영 DB update, user status 변경, merchant balance, payment state, refund state, production database write, 직접 변경 금지.
사용자 상태, 가맹점 잔액, 결제 상태, 환불 상태, 정산 결과를 변경하는 작업은 사람 승인이 필요합니다.
에이전트는 승인 요청을 만들 수 있지만 쓰기 작업을 직접 실행하면 안 됩니다.

## 감사

모든 승인 요청은 요청자, 사유, SQL 요약, 관련 문서 출처, 리뷰어 결정을 저장해야 합니다.
