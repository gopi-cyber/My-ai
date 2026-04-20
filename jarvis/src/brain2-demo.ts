#!/usr/bin/env bun
/**
 * Brain 2.0 Standalone Demo
 * 
 * Demonstrates Omni-Cognition capabilities
 * Run: bun run src/brain2-demo.ts
 */

import { brain2 } from './brain2/index.ts';
import { getDb } from './vault/schema.ts';

import type { LLMMessage } from './llm/index.ts';

console.log(`
╔═══════════════════════════════════════════════════════════╗
║     AETHER BRAIN 2.0 - OMNI-COGNITION DEMO              ║
╚═══════════════════════════════════════════════════════════╝
`);

// Mock LLM for demo (would use real LLM in production)
const mockLLM = async (msgs: LLMMessage[]) => {
  const last = msgs[msgs.length - 1];
  const lastMsg = typeof last?.content === 'string' ? last.content : '';
  
  if (lastMsg.toLowerCase().includes('hello')) {
    return "Hello! I'm AETHER with Brain 2.0. How can I help you today?";
  }
  if (lastMsg.toLowerCase().includes('what can you do')) {
    return "With Brain 2.0, I have:\n- Semantic memory (understands concepts, not just keywords)\n- Multi-agent reasoning (Strategist, Skeptic, Executor)\n- Self-evolution (dreams and learns)\n- Proactive agency (anticipates your needs)";
  }
  if (lastMsg.toLowerCase().includes('test')) {
    return "Brain 2.0 systems operational:\n✓ Deep Memory (vector embeddings)\n✓ Reasoning Council (3-agent consensus)\n✓ Dreaming Cycle (self-tuning)\n✓ Proactive Agency (intentions)";
  }
  return `I understand: "${lastMsg.slice(0, 50)}...". Brain 2.0 processing your request with full Omni-Cognition.`;
};

async function main() {
  console.log('[Demo] Starting Brain 2.0...\n');

  // Register mock LLM
  brain2.register({
    llmGenerate: mockLLM,
    llmModel: 'demo',
  });

  // Start Brain 2.0
  await brain2.start();

  console.log('[Demo] Brain 2.0 started!\n');

  // Test 1: Basic processing
  console.log('─'.repeat(50));
  console.log('Test 1: Basic Request');
  console.log('─'.repeat(50));
  
  const resp1 = await brain2.process("hello, what can you do?");
  console.log(`AETHER: ${resp1}\n`);

  // Test 2: Get status
  console.log('─'.repeat(50));
  console.log('Test 2: Brain Status');
  console.log('─'.repeat(50));
  
  const status = brain2.getStatus();
  console.log('Status:', JSON.stringify(status, null, 2));

  // Test 3: Council Decision
  console.log('\n' + '─'.repeat(50));
  console.log('Test 3: Council Decision');
  console.log('─'.repeat(50));
  
  const goal1 = await brain2.createGoalWithApproval("Test goal for demo", 7);
  console.log('Goal created:', goal1);

  // World model
  console.log('\n' + '─'.repeat(50));
  console.log('Test 4: World Model State');
  console.log('─'.repeat(50));
  
  const world = brain2.getWorldModel();
  console.log('World Model:', JSON.stringify(world, null, 2));

  // Hyperparameters
  console.log('\n' + '─'.repeat(50));
  console.log('Test 5: Hyperparameters (Auto-tuned)');
  console.log('─'.repeat(50));
  
  const hyper = brain2.getHyperparameters();
  console.log('Hyperparameters:', JSON.stringify(hyper, null, 2));

  // Stop Brain 2.0
  await brain2.stop();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║     BRAIN 2.0 DEMO COMPLETE                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);