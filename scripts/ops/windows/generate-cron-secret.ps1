$secret = node .\execute-generation.cjs
echo "New Cron Secret: ${secret}"
fly secrets set -a ab-insightful CRON_SECRET=$secret
fly secrets show