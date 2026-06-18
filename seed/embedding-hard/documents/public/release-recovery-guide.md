---
title: Release Recovery Guide
visibility: public
---

# Release Recovery Guide

When a newly shipped backend version causes elevated checkout failures, freeze additional rollout waves and restore the previous stable artifact.

Use the deployment timeline, canary error budget, and checkout success-rate graph to decide whether to revert. If customer payments are affected, notify the on-call lead and keep the incident channel updated until the stable build is serving all traffic again.

The safest mitigation is to roll back the release package, verify checkout success rate recovery, and only resume deployment after the regression owner has attached a fix plan.
