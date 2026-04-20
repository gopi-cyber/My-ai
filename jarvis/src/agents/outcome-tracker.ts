import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ExecutionOutcome {
  id: string;
  timestamp: number;
  toolName: string;
  params: Record<string, any>;
  result: string;
  success: boolean;
  executionTimeMs: number;
  tokensUsed?: number;
  agentId?: string;
  sessionId?: string;
}

export class OutcomeTracker {
  private outcomesDir: string;
  private sessionId: string;

  constructor() {
    this.sessionId = `session-${Date.now()}`;
    this.outcomesDir = join(homedir(), '.jarvis', 'outcomes');
  }

  async record(outcome: Omit<ExecutionOutcome, 'id' | 'timestamp'>): Promise<string> {
    const fullOutcome: ExecutionOutcome = {
      ...outcome,
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    const logPath = join(this.outcomesDir, `${this.sessionId}.jsonl`);
    appendFileSync(logPath, JSON.stringify(fullOutcome) + '\n');

    return fullOutcome.id;
  }

  async getRecent(limit = 50): Promise<ExecutionOutcome[]> {
    const logPath = join(this.outcomesDir, `${this.sessionId}.jsonl`);
    if (!existsSync(logPath)) return [];

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(line => JSON.parse(line));
  }

  async getStats(): Promise<{
    total: number;
    successRate: number;
    avgExecutionTime: number;
    topTools: Record<string, number>;
  }> {
    const recent = await this.getRecent(500);
    
    const successCount = recent.filter(o => o.success).length;
    const totalTime = recent.reduce((sum, o) => sum + o.executionTimeMs, 0);
    const toolCounts: Record<string, number> = {};
    
    for (const o of recent) {
      toolCounts[o.toolName] = (toolCounts[o.toolName] || 0) + 1;
    }

    return {
      total: recent.length,
      successRate: recent.length > 0 ? successCount / recent.length : 0,
      avgExecutionTime: recent.length > 0 ? totalTime / recent.length : 0,
      topTools: toolCounts,
    };
  }

  async analyzePatterns(): Promise<string> {
    const recent = await this.getRecent(100);
    
    const failed = recent.filter(o => !o.success);
    const toolFailureRates: Record<string, { failed: number; total: number }> = {};
    
    for (const o of recent) {
      if (!o.toolName) continue;
      if (!toolFailureRates[o.toolName]) {
        toolFailureRates[o.toolName] = { failed: 0, total: 0 };
      }
      const rates = toolFailureRates[o.toolName]!;
      rates.total++;
      if (!o.success) rates.failed++;
    }

    const patterns = Object.entries(toolFailureRates)
      .sort((a, b) => b[1].failed / b[1].total - a[1].failed / a[1].total)
      .filter(([_, v]) => v.failed > 0)
      .slice(0, 5)
      .map(([tool, v]) => `${tool}: ${v.failed}/${v.total} failed (${Math.round(v.failed / v.total * 100)}%)`);

    return `Failure Patterns:
${patterns.join('\n') || 'No significant failure patterns detected.'}`;
  }
}

let instance: OutcomeTracker | null = null;

export function getOutcomeTracker(): OutcomeTracker {
  if (!instance) {
    instance = new OutcomeTracker();
  }
  return instance;
}