#!/bin/sh
curl -sS -H "Cron-Secret: ${CRON_SECRET}" -H "Origin: cron.process.ab-insightful.internal" http://app.process.ab-insightful.internal:3000/api/cron/execute-analysis