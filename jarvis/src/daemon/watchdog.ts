import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * AETHER Watchdog
 * 
 * This process monitors the main daemon and ensures it stays running.
 * It handles:
 * 1. Automatic restarts on crashes.
 * 2. Signal-based reloads (exit code 101).
 * 3. Logging of crash traces.
 */

const DAEMON_SCRIPT = path.join(import.meta.dir, "index.ts");
const RESTART_CODE = 101;
const MAX_CRASH_RETRY = 5;
const RETRY_WINDOW_MS = 60000; // 1 minute

let crashCount = 0;
let lastCrashTime = 0;

function log(msg: string) {
  const ts = new Date().toISOString();
  console.log(`[Watchdog][${ts}] ${msg}`);
}

async function startDaemon() {
  log("Starting AETHER Daemon...");
  
  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const crashLogStream = fs.createWriteStream(path.join(reportsDir, "crashes.log"), { flags: 'a' });

  const child = spawn("bun", ["run", DAEMON_SCRIPT], {
    stdio: ["inherit", "inherit", "pipe"], // Pipe stderr
    env: { ...process.env, AETHER_WATCHDOG_ACTIVE: "true" }
  });

  child.stderr.pipe(crashLogStream);
  child.stderr.pipe(process.stderr); // Still show in terminal

  child.on("exit", (code) => {
    log(`Daemon exited with code ${code}`);
    
    if (code !== 0 && code !== RESTART_CODE) {
      const ts = new Date().toISOString();
      fs.appendFileSync(path.join(process.cwd(), "reports", "crashes.log"), `\n--- CRASH SEPARATOR [${ts}] [CODE ${code}] ---\n`);
    }

    if (code === 0) {
      log("Daemon stopped gracefully. Watchdog exiting.");
      process.exit(0);
    }

    if (code === RESTART_CODE) {
      log("Restart signal received (101). Respawning...");
      startDaemon();
      return;
    }

    // Handle crashes
    const now = Date.now();
    if (now - lastCrashTime > RETRY_WINDOW_MS) {
      crashCount = 0; // Reset count if stable for a while
    }

    crashCount++;
    lastCrashTime = now;

    if (crashCount >= MAX_CRASH_RETRY) {
      log(`FATAL: Daemon crashed ${crashCount} times within ${RETRY_WINDOW_MS/1000}s. Entering self-healing mode...`);
      attemptSelfHealing();
    } else {
      const delay = Math.min(1000 * Math.pow(2, crashCount), 10000);
      log(`Crash detected. Waiting ${delay}ms before restart...`);
      setTimeout(startDaemon, delay);
    }
  });
}

/**
 * Self-healing logic to be expanded as needed.
 * Currently it just logs and tries one more time after a longer delay.
 */
function attemptSelfHealing() {
  log("Self-healing: Clearing temporary caches and checking environment...");
  // Potential future: run `bun run scripts/system_check.ts`
  
  setTimeout(() => {
    log("Self-healing attempt complete. Restarting daemon...");
    crashCount = 0;
    startDaemon();
  }, 30000);
}

// Handle watchdog's own signals
process.on("SIGINT", () => {
  log("Watchdog received SIGINT. Shutting down.");
  process.exit(0);
});

startDaemon();
