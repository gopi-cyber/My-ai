import { getDb, generateId } from '../vault/schema.ts';

export type MessageType = 'task' | 'report' | 'question' | 'escalation';
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export type AgentMessage = {
  id: string;
  from_agent: string;
  to_agent: string;
  type: MessageType;
  content: string;
  priority: MessagePriority;
  requires_response: boolean;
  deadline: number | null;
  created_at: number;
};

type MessageRow = {
  id: string;
  from_agent: string;
  to_agent: string;
  type: MessageType;
  content: string;
  priority: MessagePriority;
  requires_response: number;
  deadline: number | null;
  created_at: number;
};

/**
 * Parse a message row from the database
 */
function parseMessage(row: MessageRow): AgentMessage {
  return {
    ...row,
    requires_response: row.requires_response === 1,
    deadline: row.deadline
  };
}

/**
 * Send a message between agents (persisted to DB)
 */
export async function sendMessage(
  from: string,
  to: string,
  type: MessageType,
  content: string,
  opts?: {
    priority?: MessagePriority;
    requires_response?: boolean;
    deadline?: number;
  }
): Promise<AgentMessage> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();
  const priority = opts?.priority ?? 'normal';
  const requiresResponse = opts?.requires_response ?? false;
  const deadline = opts?.deadline ?? null;

  const { error } = await db.from('agent_messages').insert([{
    id,
    from_agent: from,
    to_agent: to,
    type,
    content,
    priority,
    requires_response: requiresResponse ? 1 : 0,
    deadline,
    created_at: now
  }]);

  if (error) throw new Error(`Failed to send message: ${error.message}`);

  return {
    id,
    from_agent: from,
    to_agent: to,
    type,
    content,
    priority,
    requires_response: requiresResponse,
    deadline,
    created_at: now,
  };
}

/**
 * Get messages for an agent
 */
export async function getMessages(
  agentId: string,
  opts?: {
    type?: MessageType;
    limit?: number;
  }
): Promise<AgentMessage[]> {
  const db = getDb();
  let query = db.from('agent_messages').select('*').eq('to_agent', agentId).order('created_at', { ascending: false });

  if (opts?.type) {
    query = query.eq('type', opts.type);
  }

  const { data, error } = await query.limit(opts?.limit ?? 100);

  if (error || !data) return [];
  
  return (data as MessageRow[]).map(parseMessage);
}

/**
 * Get unread/pending messages (all messages for now - could add read tracking)
 */
export async function getPendingMessages(agentId: string): Promise<AgentMessage[]> {
  return await getMessages(agentId);
}
