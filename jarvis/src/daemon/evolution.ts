import { writeFileSync, mkdirSync, readFileSync, existsSync, truncateSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentService } from './agent-service.ts';
import type { WebSocketService } from './ws-service.ts';
import { EvolutionLogger } from './evolution-logger.ts';

export class EvolutionEngine {
  private isEvolutionRunning = false;
  private interval: Timer | null = null;
  private agentService: AgentService;
  private wsService: WebSocketService;
  private logger: EvolutionLogger;
  private restartCallback?: (code: number) => void;
  private crashLogPath: string;

  constructor(private config: any, agentService: AgentService, wsService: WebSocketService) {
    this.agentService = agentService;
    this.wsService = wsService;
    this.logger = EvolutionLogger.getInstance();
    this.crashLogPath = path.join(process.cwd(), 'reports', 'crashes.log');
  }

  public setRestartCallback(callback: (code: number) => void) {
    this.restartCallback = callback;
  }

  async start() {
    console.log('[Evolution] Autonomous Self-Learning Engine starting...');
    // Ensure reports directory exists
    const reportsDir = path.dirname(this.crashLogPath);
    if (!existsSync(reportsDir)) {
      mkdirSync(reportsDir, { recursive: true });
    }
    // Run an evolution cycle every hour
    this.interval = setInterval(() => this.runCycle(), 3600000);
    // Monitor crashes every 30 seconds
    setInterval(() => this.monitorCrashes(), 30000);
    
    // Kick off an initial scan 5 minutes after boot
    setTimeout(() => this.runCycle(), 300000);
  }

  async stop() {
    if (this.interval) clearInterval(this.interval);
  }

  private async monitorCrashes() {
    if (!existsSync(this.crashLogPath)) return;

    try {
      const content = readFileSync(this.crashLogPath, 'utf-8');
      if (!content.trim()) return;

      console.log('[Evolution] Crash log detected. Analyzing...');
      
      // Identify latest crash
      const sessions = content.split('--- CRASH SEPARATOR');
      const latestCrash = sessions[sessions.length - 1];
      
      if (latestCrash && latestCrash.includes('Error')) {
        await this.analyzeCrash(latestCrash);
        // Truncate log after analysis to prevent infinite re-analysis
        truncateSync(this.crashLogPath, 0);
      }
    } catch (err) {
      console.error('[Evolution] Error monitoring crashes:', err);
    }
  }

  private async analyzeCrash(trace: string) {
    const eventId = await this.logger.log({
      type: 'crash_fix',
      summary: 'Analyzing system crash trace',
      details: trace.slice(0, 1000), // Limit detail size
      status: 'pending'
    });

    this.wsService.broadcastNotification('⚠️ AETHER detected an internal crash. Analyzing for autonomous repair...', 'urgent');

    try {
      // Use agentService.handleMessage to analyze the crash via the LLM
      const prompt = [
        'SYSTEM ALERT: A crash was detected by the Watchdog.',
        'Analyze the following trace and describe the root cause and how to fix it.',
        'Be specific about which file and line needs to change.',
        '',
        'CRASH TRACE:',
        trace.slice(0, 2000),
      ].join('\n');

      const response = await this.agentService.handleMessage(prompt, 'system');

      console.log('[Evolution] Autonomous repair analysis:', response?.slice(0, 200));
      if (eventId) {
        await this.logger.updateStatus(eventId, 'success', response?.slice(0, 2000) ?? 'Analysis complete');
      }
      
      this.wsService.broadcastNotification('✅ Evolution Engine analyzed the crash. Check the Evolution tab for details.', 'normal');
    } catch (err: any) {
      console.error('[Evolution] Automated repair failed:', err?.message ?? err);
      if (eventId) {
        await this.logger.updateStatus(eventId, 'failed', err?.message ?? String(err));
      }
    }
  }

  private async runCycle() {
    if (this.isEvolutionRunning) return;
    this.isEvolutionRunning = true;
    try {
      console.log('[Evolution] Searching for system improvements...');

      const eventId = await this.logger.log({
        type: 'optimization',
        summary: 'Periodic optimization scan',
        status: 'pending'
      });
      
      this.wsService.broadcastNotification('🧠 Searching for system optimizations...', 'normal');
      
      const prompt = [
        'You are the AETHER God Engine. Run a quick internal systems diagnostic.',
        'Check: memory usage trends, service health, LLM response latency.',
        'If everything is stable, respond with exactly: SYSTEM STABLE.',
        'If you detect an issue, describe it clearly.',
      ].join('\n');

      const response = await this.agentService.handleMessage(prompt, 'system');
      
      if (eventId) {
        const isStable = response?.includes('SYSTEM STABLE');
        await this.logger.updateStatus(
          eventId, 
          'success', 
          isStable ? 'System is stable. No changes needed.' : (response?.slice(0, 2000) ?? 'Scan complete')
        );
      }
      console.log(`[Evolution] Cycle complete.`);
    } catch (e: any) {
      console.error('[Evolution] Cycle failed:', e?.message ?? e);
    } finally {
      this.isEvolutionRunning = false;
    }
  }

  /**
   * Safe Hot-Reload Execution wrapper to be injected as a tool.
   */
  public async safeUpdate(filePath: string, newContent: string): Promise<boolean> {
    const backupPath = `${filePath}.${Date.now()}.bak`;
    const originalContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

    console.log(`[Evolution] Safely updating ${filePath}`);

    try {
       writeFileSync(backupPath, originalContent);
       writeFileSync(filePath, newContent);

       // Run local bun test
       const res = spawnSync('bun', ['test'], { encoding: 'utf-8', cwd: process.cwd(), timeout: 30000 });
       
       if (res.status === 0) {
         console.log(`[Evolution] Tests passed! Hot reload successful.`);
         this.wsService.broadcastNotification(`Evolution Engine successfully applied updates to ${path.basename(filePath)}! Restarting system...`, 'normal');
         
         // Trigger watchdog restart after 2 seconds
         if (this.restartCallback) {
           setTimeout(() => this.restartCallback!(101), 2000);
         }
         return true;
       } else {
         console.warn(`[Evolution] Test failed. Rolling back ${filePath}...`);
         writeFileSync(filePath, originalContent);
         this.wsService.broadcastNotification(`Update to ${path.basename(filePath)} failed verification. Rolled back.`, 'urgent');
         return false;
       }
    } catch(e) {
      console.error(`[Evolution] Update error:`, e);
      writeFileSync(filePath, originalContent);
      return false;
    }
  }
}
