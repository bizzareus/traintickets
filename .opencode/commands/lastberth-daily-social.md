---
description: Run the daily screenshot-proof train audit and Instagram post; pass audit-only or login-check to prevent publication.
agent: lastberth-social
model: openai/gpt-6-astra
---

Load and execute the lastberth-daily-audit skill. Mode: $ARGUMENTS.
If no mode is supplied, execute the daily authorized audit and publish at most one verified carousel to @lastberth.in.
