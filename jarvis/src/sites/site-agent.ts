/**
 * SiteAgent — Specialized autonomous coder for Site Builder projects.
 * Extends the core agent logic with deep site-building capabilities.
 */

import { AgentOrchestrator } from '../agents/orchestrator.ts';
import type { ToolDefinition } from '../actions/tools/registry.ts';
import type { SiteBuilderService } from './service.ts';
import { setDefaultCwd } from '../actions/tools/utils.ts';

export class SiteAgent {
  private orchestrator: AgentOrchestrator;
  private siteService: SiteBuilderService;

  constructor(siteService: SiteBuilderService, orchestrator: AgentOrchestrator) {
    this.siteService = siteService;
    this.orchestrator = orchestrator;
  }

  /**
   * Run an autonomous task on a specific project.
   */
  async buildProject(projectId: string, instruction: string) {
    const project = await this.siteService.projectManager.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const projectPath = this.siteService.projectManager.getProjectPath(projectId);
    setDefaultCwd(projectPath);

    const systemPrompt = `You are the AETHER Site Builder Agent, a superhuman coder specialized in building web applications, games, and sites.
Project: ${project.name}
Path: ${projectPath}

Capabilities:
1. File Manipulation: Read, write, and delete project files.
2. Dependency Management: Install packages using 'site_run_command'.
3. Autonomous Testing: Run build scripts or linters and fix errors.
4. Self-Evolution: Improve the codebase based on feedback.

Rules:
- Always check the file tree before writing files.
- If a command fails, read the error, fix the code, and retry.
- You operate autonomously. Only stop when the task is fully verified.
- Do NOT start dev servers via site_run_command.

Context:
Instruction: ${instruction}
`;

    return this.orchestrator.streamMessage(instruction, 'site-builder', {
      forceSystemPrompt: systemPrompt,
      projectId,
    });
  }
}
