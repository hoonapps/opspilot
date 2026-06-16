---
title: "Redis Incident Runbook"
visibility: team
teamSlug: platform
tags: redis,incident,runbook
---

# Redis Incident Runbook

## High Memory

Redis memory pressure is critical when used memory is above 85 percent for 10 minutes.
Check the top keys report before deleting any key.
Scale the cache node if user session keys are growing normally.

## Connection Spike

If connection count spikes after deployment, check the API connection pool configuration.
Rollback the deployment if connection count does not drop within 5 minutes.

## Sensitive Operations

Deleting Redis keys in production requires human approval unless the incident commander explicitly approves in the incident thread.
