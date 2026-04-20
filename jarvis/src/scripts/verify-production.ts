// src/scripts/verify-production.ts
import { Database } from "bun:sqlite";

async function runTests() {
  console.log("🚀 AETHER Production Verification Suite");
  console.log("---------------------------------------");

  // 1. Check Database
  try {
    const db = new Database(process.env.AETHER_DB_PATH || "C:/Users/chitr/.jarvis/jarvis.db");
    const entityCount = db.query("SELECT COUNT(*) as count FROM entities").get() as { count: number };
    console.log(`✅ Database accessible. Found ${entityCount.count} entities.`);
  } catch (err) {
    console.error("❌ Database check failed:", err);
  }

  // 2. Check specialist agents
  try {
    const response = await fetch("http://localhost:3142/api/agents/specialists");
    if (response.ok) {
      const data = await response.json() as { specialists: any[] };
      const specialists = data.specialists || [];
      console.log(`✅ Agents service online. ${specialists.length} specialists active.`);
      if (specialists.length < 11) {
        console.warn(`⚠️ Warning: Expected at least 11 specialists, found ${specialists.length}`);
      }
    } else {
      console.error("❌ Agents API returned status:", response.status);
    }
  } catch (err) {
    console.error("❌ Agents service unreachable.");
  }

  // 3. Check Site Builder (Projects)
  try {
    const response = await fetch("http://localhost:3142/api/sites/projects");
    if (response.ok) {
      const projects = await response.json();
      console.log(`✅ Site Builder active. ${projects.length} projects found.`);
    } else {
      console.error(`❌ Site Builder API (/api/sites/projects) returned status: ${response.status}`);
    }
  } catch (err) {
    console.error("❌ Site Builder service unreachable.");
  }

  // 4. Check Workflows
  try {
    const response = await fetch("http://localhost:3142/api/workflows");
    if (response.ok) {
      const workflows = await response.json();
      console.log(`✅ Workflows engine active. ${workflows.length} workflows found.`);
    }
  } catch (err) {
    console.error("❌ Workflow engine unreachable.");
  }

  console.log("---------------------------------------");
  console.log("Verification complete.");
}

runTests();
