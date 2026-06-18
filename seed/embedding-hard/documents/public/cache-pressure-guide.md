---
title: Cache Pressure Guide
visibility: public
---

# Cache Pressure Guide

If user sessions start expiring early and the in-memory store is near capacity, reduce unnecessary keys before increasing the cluster size.

Check eviction rate, memory fragmentation, hot-key distribution, and TTL hygiene. The first mitigation is to shorten noisy diagnostic keys and move non-session payloads out of the cache path.

Escalate to platform only when memory pressure stays high after cleanup and session churn is still visible in the login funnel.
