
import { expect, test, describe, mock, spyOn } from "bun:test";
import { LLMManager } from "../src/llm/manager";
import type { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider";

describe("LLMManager Autonomous Failover", () => {
  test("should promote fallback to primary after 3 failures", async () => {
    const manager = new LLMManager();
    let promoteCount = 0;
    let promotedTo = "";

    manager.setOnPromotePrimary((name) => {
      promoteCount++;
      promotedTo = name;
    });

    const failingProvider: LLMProvider = {
      name: "failing",
      chat: async () => { throw new Error("API Down"); },
      stream: async function* () { throw new Error("API Down"); }
    };

    const healthyProvider: LLMProvider = {
      name: "healthy",
      chat: async () => ({ text: "I am backup", role: "assistant" }),
      stream: async function* () { yield { type: "text", text: "I am backup" }; }
    };

    manager.registerProvider(failingProvider, "failing");
    manager.registerProvider(healthyProvider, "healthy");
    
    manager.setPrimary("failing");
    manager.setFallbackChain(["healthy"]);
    manager.setReliabilityMode(true);

    // Initial state
    expect(manager.getPrimary()).toBe("failing");

    // Failure 1
    try { await manager.chat([{ role: "user", content: "test" }]); } catch (e) {}
    expect(manager.getPrimary()).toBe("failing");

    // Failure 2
    try { await manager.chat([{ role: "user", content: "test" }]); } catch (e) {}
    expect(manager.getPrimary()).toBe("failing");

    // Failure 3 -> Should trigger promotion
    try { await manager.chat([{ role: "user", content: "test" }]); } catch (e) {}
    
    expect(manager.getPrimary()).toBe("healthy");
    expect(promoteCount).toBe(1);
    expect(promotedTo).toBe("healthy");
    
    // Recovery check: failing is now fallback
    expect(manager.getFallbackChain()).toContain("failing");
  });
});
