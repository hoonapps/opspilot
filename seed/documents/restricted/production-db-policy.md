---
title: "Production Database Access Policy"
visibility: restricted
tags: security,database,approval
---

# Production Database Access Policy

## Access Rule

Direct production database writes are restricted.
Only `ops_admin` or `security_admin` can request a production write approval.

## Approval Required

Any operation that updates user status, merchant balance, payment state, refund state, or settlement result requires human approval.
The agent may create an approval request, but it must not execute the write.

## Audit

Every approval request must store requester, reason, SQL summary, related document sources, and reviewer decision.
