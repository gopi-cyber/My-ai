import { getDb, generateId } from './schema.ts';

export type MessageRole = 'user' | 'assistant' | 'system';

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_calls: unknown[] | null;
  created_at: number;
};

export type Conversation = {
  id: string;
  agent_id: string | null;
  channel: string | null;
  started_at: number;
  last_message_at: number;
  message_count: number;
  metadata: Record<string, unknown> | null;
};

type ConversationRow = {
  id: string;
  agent_id: string | null;
  channel: string | null;
  started_at: number;
  last_message_at: number;
  message_count: number;
  metadata: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  created_at: number;
};

function parseConversation(row: ConversationRow): Conversation {
  return {
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  };
}

function parseMessage(row: MessageRow): ConversationMessage {
  return {
    ...row,
    tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
  };
}

/**
 * Get or create the active conversation for a channel.
 * Returns the most recent conversation for the channel, or creates a new one.
 */
export async function getOrCreateConversation(channel: string): Promise<Conversation> {
  const db = getDb();
  const now = Date.now();

  // Look for a recent conversation on this channel (within last 4 hours)
  const cutoff = now - 4 * 60 * 60 * 1000;
  
  const { data: existing, error } = await db
    .from('conversations')
    .select('*')
    .eq('channel', channel)
    .gt('last_message_at', cutoff)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !error) {
    return parseConversation(existing as ConversationRow);
  }

  // Create new conversation
  const id = generateId();
  await db.from('conversations').insert({
    id, 
    channel, 
    started_at: now, 
    last_message_at: now, 
    message_count: 0
  });

  return {
    id,
    agent_id: null,
    channel,
    started_at: now,
    last_message_at: now,
    message_count: 0,
    metadata: null,
  };
}

/**
 * Add a message to a conversation.
 * Updates conversation metadata (last_message_at, message_count).
 */
export async function addMessage(
  conversationId: string,
  msg: { role: MessageRole; content: string; tool_calls?: unknown[] }
): Promise<ConversationMessage> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error: insertError } = await db.from('conversation_messages').insert({
    id,
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
    created_at: now
  });

  if (insertError) throw new Error(`Failed to insert message: ${insertError.message}`);

  // Update conversation
  const { data: conv } = await db.from('conversations').select('message_count').eq('id', conversationId).single();
  const newCount = (conv?.message_count ?? 0) + 1;

  await db.from('conversations').update({ 
    last_message_at: now, 
    message_count: newCount 
  }).eq('id', conversationId);

  return {
    id,
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ?? null,
    created_at: now,
  };
}

/**
 * Get messages for a conversation, ordered by time ascending.
 */
export async function getMessages(
  conversationId: string,
  opts?: { limit?: number; before?: number }
): Promise<ConversationMessage[]> {
  const db = getDb();
  const limit = opts?.limit ?? 100;

  let query = db.from('conversation_messages').select('*').eq('conversation_id', conversationId);

  if (opts?.before) {
    query = query.lt('created_at', opts.before).order('created_at', { ascending: true }).limit(limit);
  } else {
    // Get the last N messages
    query = query.order('created_at', { ascending: false }).limit(limit);
  }

  const { data: rows, error } = await query;
  if (error || !rows) return [];

  const result = (rows as MessageRow[]).map(parseMessage);
  
  // If we fetched the last session (no 'before' filter), we need to reverse to get ascending order
  if (!opts?.before) {
    return result.reverse();
  }
  
  return result;
}

/**
 * Get the most recent conversation for a channel, with its messages.
 */
export async function getRecentConversation(channel: string): Promise<{
  conversation: Conversation;
  messages: ConversationMessage[];
} | null> {
  const db = getDb();
  const { data: row, error } = await db
    .from('conversations')
    .select('*')
    .eq('channel', channel)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || error) return null;

  const conversation = parseConversation(row as ConversationRow);
  const messages = await getMessages(conversation.id);

  return { conversation, messages };
}
