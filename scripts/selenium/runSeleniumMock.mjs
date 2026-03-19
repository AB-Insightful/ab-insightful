import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const SHOPIFY_PROXY_PORT_REGEX = /Proxy server started on port\s+(\d+)/;
const DEFAULT_MOCK_BRIDGE_UI_PORT = 4173;
const MOCK_BRIDGE_SHOP = "test.myshopify.com";

const themeAppExtensionPort = process.env.THEME_APP_EXTENSION_PORT ?? "9294";
let mockBridgeUiPort = Number(
  process.env.MOCK_BRIDGE_UI_PORT ?? DEFAULT_MOCK_BRIDGE_UI_PORT,
);

function npmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxBin() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function shopifyBin() {
  return process.platform === "win32" ? "shopify" : "shopify";
}

async function waitForPortOpen(
  host,
  port,
  { timeoutMs = 120000, intervalMs = 500 } = {},
) {
  const startedAt = Date.now();

  async function attempt() {
    return await new Promise((resolve, reject) => {
      const socket = net.connect({ host, port }, () => {
        socket.end();
        resolve(true);
      });

      socket.on("error", reject);
    });
  }

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await attempt();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error(
    `Timed out waiting for ${host}:${port} to accept connections`,
  );
}

function getLastNLines(lines, n) {
  if (lines.length <= n) return lines;
  return lines.slice(lines.length - n);
}

async function detectProxyPort(shopifyProc, { timeoutMs = 60000 } = {}) {
  let proxyPort = null;
  let buffer = "";

  const outputLines = [];
  let doneResolve;
  let doneReject;

  const done = new Promise((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });

  const onChunk = (chunk) => {
    const text = chunk.toString();

    // Keep a small sliding window for regex matching across chunk boundaries.
    buffer = (buffer + text).slice(-50_000);

    // Track recent lines for debug output.
    const parts = text.split(/\r?\n/);
    for (const p of parts) {
      if (!p.trim()) continue;
      outputLines.push(p);
    }
    if (outputLines.length > 400)
      outputLines.splice(0, outputLines.length - 400);

    const match = buffer.match(SHOPIFY_PROXY_PORT_REGEX);
    if (match && match[1]) {
      proxyPort = Number(match[1]);
      doneResolve(proxyPort);
    }
  };

  const timeout = setTimeout(() => {
    doneReject(
      new Error(
        [
          "Timed out waiting for Shopify proxy port to be detected.",
          "Expected log line matching: 'Proxy server started on port <number>'.",
          "Last output lines:",
          ...getLastNLines(outputLines, 200).map((l) => `- ${l}`),
        ].join("\n"),
      ),
    );
  }, timeoutMs);

  shopifyProc.stdout?.on("data", (d) => {
    process.stdout.write(d);
    onChunk(d);
  });

  shopifyProc.stderr?.on("data", (d) => {
    process.stderr.write(d);
    onChunk(d);
  });

  const port = await done;
  clearTimeout(timeout);
  return port;
}

async function safeKill(proc, label) {
  const pid = proc?.pid;
  if (!pid) return;

  console.log(`[safeKill] ${label}: pid=${pid}`);

  if (process.platform === "win32") {
    // taskkill /T: kills the whole process tree spawned from this PID.
    // taskkill /F: forces termination.
    try {
      try {
        proc.kill();
      } catch {
        // ignore
      }

      await new Promise((resolve) => {
        const tk = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        tk.on("exit", () => resolve(true));
        tk.on("error", () => resolve(false));
      });
    } catch {
      // Best-effort only.
    }
    return;
  }

  // Non-Windows: rely on signals.
  try {
    proc.kill("SIGTERM");
  } catch {
    // ignore
  }

  await new Promise((r) => setTimeout(r, 2000));

  try {
    proc.kill("SIGKILL");
  } catch {
    // ignore
  }
}

async function detectMockBridgeUiPort(
  mockBridgeProc,
  { timeoutMs = 6000 } = {},
) {
  // mock-bridge stdout contains lines like:
  //   Mock Admin: http://localhost:3080
  //   URL: http://localhost:3080
  const regexes = [
    /Mock Admin:\s*http:\/\/localhost:(\d+)/,
    /URL:\s*http:\/\/localhost:(\d+)/,
  ];

  let buffer = "";
  const outputLines = [];

  let doneResolve;
  const done = new Promise((resolve) => {
    doneResolve = resolve;
  });

  const onChunk = (d) => {
    const text = d.toString();
    buffer = (buffer + text).slice(-50_000);

    const parts = text.split(/\r?\n/);
    for (const p of parts) {
      if (!p.trim()) continue;
      outputLines.push(p);
    }
    if (outputLines.length > 400)
      outputLines.splice(0, outputLines.length - 400);

    for (const rx of regexes) {
      const m = buffer.match(rx);
      if (m && m[1]) return doneResolve(Number(m[1]));
    }
  };

  mockBridgeProc.stdout?.on("data", (d) => {
    process.stdout.write(d);
    onChunk(d);
  });
  mockBridgeProc.stderr?.on("data", (d) => {
    process.stderr.write(d);
    onChunk(d);
  });

  const timeout = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          [
            "Timed out waiting for mock-bridge UI port detection.",
            "Expected log lines containing `Mock Admin: http://localhost:<port>`.",
            "Last output lines:",
            ...getLastNLines(outputLines, 80).map((l) => `- ${l}`),
          ].join("\n"),
        ),
      );
    }, timeoutMs).unref?.();
  });

  return await Promise.race([done, timeout]);
}

async function main() {
  // Certificate is needed because Shopify’s local proxy uses HTTPS.
  // If it’s missing, Shopify may prompt (which breaks automation).
  const certPem = path.resolve(process.cwd(), ".shopify", "localhost.pem");
  if (!fs.existsSync(certPem)) {
    throw new Error(
      [
        `Missing ${path.relative(process.cwd(), certPem)}.`,
        "Run `shopify app dev --localhost-port 3000` manually once to generate localhost certificates, then re-run tests.",
      ].join("\n"),
    );
  }

  let shopifyProc;
  let mockBridgeProc;

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("[shutdown] cleanup starting");
    console.log(
      `[shutdown] shopifyProc pid=${shopifyProc?.pid ?? "none"}, mockBridgeProc pid=${
        mockBridgeProc?.pid ?? "none"
      }`,
    );

    await safeKill(mockBridgeProc, "mock-bridge");
    await safeKill(shopifyProc, "shopify app dev");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    // Start Shopify dev server (DO NOT use --localhost-port; it breaks webhook registration).
    // Use `shell: true` so the `shopify` CLI is resolved the same way as in npm scripts.
    shopifyProc = spawn(
      `shopify app dev --theme-app-extension-port ${String(themeAppExtensionPort)}`,
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        shell: true,
      },
    );

    const proxyPort = await detectProxyPort(shopifyProc, { timeoutMs: 60000 });
    console.log(`Detected proxy port: ${proxyPort}`);

    // Start mock-bridge pointed at the proxy port.
    // Using `shell: true` avoids Windows spawn quirks with npx/*.cmd.
    mockBridgeProc = spawn(
      `${npxBin()} @getverdict/mock-bridge http://localhost:${proxyPort} --shop ${MOCK_BRIDGE_SHOP}`,
      { stdio: ["ignore", "pipe", "pipe"], env: process.env, shell: true },
    );

    // Dynamically detect mock-bridge UI port (it may not always be 4173).
    mockBridgeUiPort = await detectMockBridgeUiPort(mockBridgeProc, {
      timeoutMs: 60000,
    });
    console.log(`Detected mock-bridge UI port: ${mockBridgeUiPort}`);

    // Wait until mock-bridge UI is reachable.
    await waitForPortOpen("localhost", mockBridgeUiPort);
    console.log(
      `mock-bridge UI is reachable on http://localhost:${mockBridgeUiPort}`,
    );

    // Run Selenium tests with deterministic backend API base URL.
    const appBaseUrl = `http://localhost:${proxyPort}`;
    const shopifyAdminUrl = `http://localhost:${mockBridgeUiPort}/admin/apps/ab-insightful?shop=test.myshopify.com`;

    // On Windows, prefer `shell: true` with a command string so `.cmd` binaries
    // (npm.cmd) run reliably.
    const vitestCmd = `${npmBin()} run test:selenium`;
    const vitestProc = spawn(vitestCmd, {
      stdio: "inherit",
      env: {
        ...process.env,
        APP_BASE_URL: appBaseUrl,
        MOCK_BRIDGE_UI_PORT: String(mockBridgeUiPort),
        SHOPIFY_ADMIN_APP_URL: shopifyAdminUrl,
      },
      shell: true,
      windowsHide: true,
    });

    const exitCode = await new Promise((resolve) => {
      vitestProc.on("exit", (code) => resolve(code ?? 1));
    });

    // Let the caller see the test result via exit code.
    process.exitCode = exitCode;
  } finally {
    await shutdown();
  }
}

await main();
