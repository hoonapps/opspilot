---
title: "Settlement Batch Delay Runbook"
visibility: team
teamSlug: payments
tags: settlement,batch,runbook
---

# Settlement Batch Delay Runbook

## Symptoms

Settlement batch is considered delayed when `settlement.batch.completed_at` is more than 30 minutes behind schedule.
The usual customer impact is delayed merchant payout visibility.

## Checklist

Korean aliases: 정산 배치 지연, 정산 30분 지연, 정산 체크리스트, 배치 지연 대응.
1. Check `settlement-worker` queue depth.
2. Check `settlement.dlq.count`.
3. Verify that the latest bank file was downloaded.
4. If DLQ count is above 100, pause settlement retry jobs.
5. Notify `#payments-oncall` and create an incident summary.

## Recovery

After the bank file is reprocessed, run the settlement reconciliation report.
Do not change merchant balance manually without approval from the payments lead.
