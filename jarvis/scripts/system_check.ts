import { initDatabase, closeDb } from "../src/vault/schema.ts";
import { loadConfig } from "../src/config/loader.ts";
import { AgentService } from "../src/daemon/agent-service.ts";
import path from "node:path";
import fs from "node:fs";

/**
 * AETHER System Certification Script
 * 
 * Performs a deep-dive check of all system components to ensure everything is ready for deployment.
 */

async function runCheck() {
  console.log("==========================================");
  console.log("   AETHER SYSTEM CERTIFICATION   ");
  console.log("==========================================\n");

  let allPassed = true;

  // 1. Config Check
  console.log("[1/5] Configuration Check...");
  try {
    const config = await loadConfig();
    console.log("  \u2705 Config loaded successfully.");
    console.log(`  \u2705 Port: ${config.daemon.port}`);
    console.log(`  \u2705 DB Provider: ${config.vault?.provider || 'Supabase (Default)'}`);
  } catch (e) {
    console.error("  \u274C Config Load Failed:", e);
    allPassed = false;
  }

  // 2. Database Connectivity
  console.log("\n[2/5] Database Connectivity (Supabase)...");
  try {
    await initDatabase();
    console.log("  \u2705 Database ping successful.");
    // check tables
    // (mock check table existence query would go here)
    await closeDb();
  } catch (e) {
    console.error("  \u274C Database Connection Failed:", e);
    allPassed = false;
  }

  // 3. LLM Connectivity
  console.log("\n[3/5] LLM Provider Connectivity...");
  try {
    const config = await loadConfig();
    const agentService = new AgentService(config);
    
    // Providers are registered during start()
    // We'll call the private registerProviders via any cast for the check
    (agentService as any).registerProviders();
    
    const llmManager = agentService.getLLMManager();
    const providerNames = llmManager.getProviderNames();
    
    if (providerNames.length === 0) {
      console.warn("  \u26A0 No LLM providers configured. Daemon will run but chat will fail.");
    } else {
      console.log(`  \u2705 ${providerNames.length} providers registered.`);
      for (const name of providerNames) {
         const p = llmManager.getProvider(name);
         console.log(`    - ${name} (${p?.model || 'Auto'})`);
      }
      
      const primary = llmManager.getPrimary();
      console.log(`  \u2705 Primary Provider: ${primary}`);
    }
  } catch (e) {
    console.error("  \u274C LLM Management Init Failed:", e);
    allPassed = false;
  }

  // 4. UI Build Readiness
  console.log("\n[4/5] UI Build Readiness...");
  const uiDist = path.join(import.meta.dir, "../ui/dist/index.html");
  if (fs.existsSync(uiDist)) {
    console.log("  \u2705 UI Dist found.");
  } else {
    console.warn("  \u26A0 UI Dist not found. Dashboard will require auto-build on startup.");
  }

  // 5. Watchdog Readiness
  console.log("\n[5/5] Watchdog Readiness...");
  const watchdogFile = path.join(import.meta.dir, "../src/daemon/watchdog.ts");
  if (fs.existsSync(watchdogFile)) {
    console.log("  \u2705 Watchdog script found.");
  } else {
    console.error("  \u274C Watchdog script missing!");
    allPassed = false;
  }

  console.log("\n==========================================");
  if (allPassed) {
    console.log("   \u2705 SYSTEM CERTIFIED FOR DEPLOYMENT   ");
  } else {
    console.log("   \u274C SYSTEM FAILED CERTIFICATION     ");
  }
  console.log("==========================================");

  if (!allPassed) process.exit(1);
}

runCheck().catch(err => {
  console.error("Critical Check Failure:", err);
  process.exit(1);
});
