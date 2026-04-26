import { spawn } from "node:child_process";

const PORT = process.env.PORT ?? "3000";

// Regex for quick tunnel URLs
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let tunnelUrl;
let cloudflaredProc;

function startShopify(url) {
  console.log(`\nUsing tunnel URL: ${url}\n`);

  // Start Shopify CLI
  const shopifyProc = spawn("shopify", ["app", "dev", `--tunnel-url=${url}`], {
    stdio: "inherit",
    shell: false,
  });

  const shutdown = () => {
    if (shopifyProc && !shopifyProc.killed) shopifyProc.kill("SIGINT");
    if (cloudflaredProc && !cloudflaredProc.killed) cloudflaredProc.kill("SIGINT");
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });

  shopifyProc.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}

function startCloudflared() {
  console.log(`Starting cloudflared -> http://localhost:${PORT}`);

  cloudflaredProc = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${PORT}`],
    { shell: false }
  );

  cloudflaredProc.stdout.setEncoding("utf8");
  cloudflaredProc.stderr.setEncoding("utf8");

  const onData = (data) => {
    process.stdout.write(data);

    if (!tunnelUrl) {
      const match = data.match(URL_RE);
      if (match) {
        tunnelUrl = match[0];
        startShopify(tunnelUrl);
      }
    }
  };

  cloudflaredProc.stdout.on("data", onData);
  cloudflaredProc.stderr.on("data", onData);

  cloudflaredProc.on("exit", (code) => {
    if (!tunnelUrl) {
      console.error(`cloudflared exited before a URL was found (code ${code})`);
      process.exit(code ?? 1);
    }
  });
}

startCloudflared();