PORT=3000

# Start cloudflared, capture the first trycloudflare URL it prints
TUNNEL_URL="$(
  cloudflared tunnel --url "http://localhost:$PORT" 2>&1 \
    | tee /dev/stderr \
    | grep -m 1 -Eo 'https://[a-z0-9-]+\.trycloudflare\.com'
)"

# Run Shopify CLI using that tunnel URL
shopify app dev --tunnel-url="$TUNNEL_URL"