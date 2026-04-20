/**
 * Global Workspace - The "Consciousness" Stream
 *
 * A shared state container for the Brain. All modules post their
 * "thoughts" here, and the Cognitive Loop processes them.
 *
 * Architecture:
 * - Working Memory: Current goals, last N events
 * - Attention: What's "loudest" right now
 * - BlackBoard: Proposed actions waiting for approval
 */

export type Thought = {
  id: string;
  source: 'perception' | 'memory' | 'reasoning' | 'critic' | 'reflection';
  type: 'event' | 'belief' | 'goal' | 'action' | 'critique' | 'reflection';
  content: string;
  data?: Record<string, unknown>;
  priority: number;       // 0-10, higher = louder
  timestamp: number;
  validated?: boolean;
  rejected?: boolean;
};

export type Goal = {
  id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  priority: number;
  subgoals: string[];       // IDs of sub-goals
  parent?: string;       // ID of parent goal
  createdAt: number;
  completedAt?: number;
};

export type WorkingMemory = {
  currentGoals: Goal[];
  recentThoughts: Thought[];       // Last 20 thoughts
  activeFocus: string | null;   // ID of the main thought being processed
  energy: number;                // 0-100, decreases with continuous work
  context: Record<string, unknown>; // Key-value store for current context
};

export type SimulationResult = {
  predicted_outcome: string;
  confidence: number;
  risks: string[];
  alternatives: string[];
};

export class GlobalWorkspace {
  private memory: WorkingMemory = {
    currentGoals: [],
    recentThoughts: [],
    activeFocus: null,
    energy: 100,
    context: {},
  };
  private blackboard: Map<string, Thought> = new Map();
  private maxThoughts = 20;

  /**
   * Post a thought to the workspace (from any module)
   */
  postThought(thought: Omit<Thought, 'id' | 'timestamp'>): string {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullThought: Thought = {
      ...thought,
      id,
      timestamp: Date.now(),
    };

    this.blackboard.set(id, fullThought);
    this.memory.recentThoughts.unshift(fullThought);
    
    if (this.memory.recentThoughts.length > this.maxThoughts) {
      this.memory.recentThoughts.pop();
    }

    return id;
  }

  /**
   * Set the current focus (what we're thinking about)
   */
  setFocus(thoughtId: string): void {
    const thought = this.blackboard.get(thoughtId);
    if (thought) {
      this.memory.activeFocus = thoughtId;
    }
  }

  /**
   * Get the loudest thought (highest priority)
   */
  getAttention(): Thought | null {
    let loudest: Thought | null = null;

    for (const thought of this.blackboard.values()) {
      if (thought.validated || thought.rejected) continue;
      
      if (!loudest || thought.priority > loudest.priority) {
        loudest = thought;
      }
    }

    return loudest;
  }

  /**
   * Get all pending actions (from reasoning)
   */
  getPendingActions(): Thought[] {
    return Array.from(this.blackboard.values())
      .filter(t => t.type === 'action' && !t.validated && !t.rejected)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Approve or reject a proposed action
   */
  validateAction(thoughtId: string, approved: boolean, reason?: string): void {
    const thought = this.blackboard.get(thoughtId);
    if (thought) {
      thought.validated = approved;
      if (reason) {
        thought.content += ` [${approved ? 'APPROVED' : 'REJECTED'}: ${reason}]`;
      }
    }
  }

  /**
   * Add a goal to working memory
   */
  addGoal(goal: Omit<Goal, 'id' | 'createdAt'>): string {
    const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullGoal: Goal = {
      ...goal,
      id,
      createdAt: Date.now(),
    };

    this.memory.currentGoals.push(fullGoal);
    return id;
  }

  /**
   * Update goal status
   */
  updateGoal(goalId: string, status: Goal['status']): void {
    const goal = this.memory.currentGoals.find(g => g.id === goalId);
    if (goal) {
      goal.status = status;
      if (status === 'completed' || status === 'failed') {
        goal.completedAt = Date.now();
      }
    }
  }

  /**
   * Get active goals
   */
  getActiveGoals(): Goal[] {
    return this.memory.currentGoals.filter(g => g.status === 'pending' || g.status === 'active');
  }

  /**
   * Get working memory snapshot
   */
  getMemory(): WorkingMemory {
    return { ...this.memory };
  }

  /**
   * Store context value
   */
  setContext(key: string, value: unknown): void {
    this.memory.context[key] = value;
  }

  /**
   * Get context value
   */
  getContext<T>(key: string): T | undefined {
    return this.memory.context[key] as T | undefined;
  }

  /**
   * Decrease energy (fatigue)
   */
  drainEnergy(amount: number): void {
    this.memory.energy = Math.max(0, this.memory.energy - amount);
  }

  /**
   * Restore energy (rest)
   */
  restoreEnergy(amount: number): void {
    this.memory.energy = Math.min(100, this.memory.energy + amount);
  }

  /**
   * Get current energy level
   */
  getEnergy(): number {
    return this.memory.energy;
  }

  /**
   * Clear rejected thoughts
   */
  cleanup(): void {
    for (const [id, thought] of this.blackboard.entries()) {
      if (thought.rejected) {
        this.blackboard.delete(id);
      }
    }
  }
}

/**
 * Global singleton instance
 */
export const workspace = new GlobalWorkspace();