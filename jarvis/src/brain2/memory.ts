/**
 * Deep Memory - Vector-Based Semantic Storage
 *
 * Replaces keyword-based search with semantic embeddings.
 * Uses Ollama to generate embeddings for experiences,
 * enabling concept-based retrieval.
 */

import type { Episode } from '../brain/episodic_memory.ts';
import { getDb } from '../vault/schema.ts';

export type Embedding = number[];
export type MemoryEntry = {
  id: string;
  content: string;
  embedding: Embedding;
  type: 'experience' | 'belief' | 'fact' | 'pattern';
  metadata: Record<string, unknown>;
  strength: number;       // 0-1, how "hardened" this memory is
  created_at: number;
  last_accessed?: number;
  access_count: number;
};

export type RetrievedMemory = {
  entry: MemoryEntry;
  similarity: number;
};

const EMBEDDING_MODEL = 'nomic-embed-text';
const DIMENSION = 768;
const MAX_MEMORIES = 5000;
const CONSOLIDATION_THRESHOLD = 0.85;
const RETRIEVE_TOP_K = 10;

class DeepMemory {
  private db = getDb();
  private embeddingCache: Map<string, Embedding> = new Map();
  private ollamaUrl: string;
  private isInitialized = false;

  constructor(ollamaUrl: string = 'http://localhost:11434') {
    this.ollamaUrl = ollamaUrl;
  }

  /**
   * Initialize and create tables
   */
  async init(): Promise<void> {
    const { error } = await this.db.from('deep_memories').select('id').limit(1);
    
    if (error) {
      console.log('[DeepMemory] Creating memory table...');
      // Table will be created if it doesn't exist via Supabase
    }
    
    this.isInitialized = true;
    console.log('[DeepMemory] Initialized');
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<Embedding> {
    // Check cache first
    const cacheKey = text.slice(0, 100);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding error: ${response.status}`);
      }

      const data = await response.json() as { embedding: number[] };
      this.embeddingCache.set(cacheKey, data.embedding);
      return data.embedding;
    } catch (err) {
      console.error('[DeepMemory] Embed failed:', err);
      // Fallback: simple hash-based pseudo-embedding
      return this.simpleHashEmbedding(text);
    }
  }

  /**
   * Simple fallback embedding (for when Ollama isn't available)
   */
  private simpleHashEmbedding(text: string): Embedding {
    const hash = new Uint8Array(DIMENSION);
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      const idx1 = i % DIMENSION;
      const idx2 = (i * 7) % DIMENSION;
      hash[idx1] = (hash[idx1] || 0) ^ char;
      hash[idx2] = (hash[idx2] || 0) + (char >> 3);
    }
    return Array.from(hash).map(v => v / 255);
  }

  /**
   * Store a memory with embedding
   */
  async store(entry: Omit<MemoryEntry, 'id' | 'embedding' | 'created_at' | 'access_count'>): Promise<string> {
    const content = entry.content;
    const embedding = await this.embed(content);
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      embedding,
      created_at: Date.now(),
      access_count: 0,
    };

    // Store in database
    const { error } = await this.db.from('deep_memories').upsert({
      id,
      content,
      embedding: JSON.stringify(embedding),
      type: entry.type,
      metadata: entry.metadata,
      strength: entry.strength,
      created_at: fullEntry.created_at,
      access_count: 0,
    });

    if (error) {
      console.error('[DeepMemory] Store error:', error);
    }

    return id;
  }

  /**
   * Consolidate multiple experiences into a belief
   */
  async consolidateBelief(experiences: Episode[]): Promise<string> {
    if (experiences.length < 3) {
      throw new Error('Need at least 3 experiences to form a belief');
    }

    // Extract the common pattern
    const patterns = experiences.map(e => e.summary);
    const common = this.extractCommonPattern(patterns);
    
    const beliefContent = `BELIEF: ${common}`;
    
    return await this.store({
      content: beliefContent,
      type: 'belief',
      metadata: {
        source_episodes: experiences.map(e => e.id),
        consolidation_count: experiences.length,
        created_at: Date.now(),
      },
      strength: 0.9, // Strong belief
    });
  }

  /**
   * Extract common pattern from text array
   */
  private extractCommonPattern(texts: string[]): string {
    const words: Map<string, number> = new Map();
    
    for (const text of texts) {
      const tokens = text.toLowerCase().split(/\W+/);
      for (const token of tokens) {
        if (token.length > 3) {
          words.set(token, (words.get(token) || 0) + 1);
        }
      }
    }

    // Find most common words
    const sorted = Array.from(words.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return sorted.join(' + ');
  }

  /**
   * Semantic retrieval
   */
  async retrieve(query: string, K = RETRIEVE_TOP_K, minSimilarity = 0.3): Promise<RetrievedMemory[]> {
    const queryEmbedding = await this.embed(query);

    // Get all memories (real implementation would use vector DB similarity)
    const { data: memories, error } = await this.db
      .from('deep_memories')
      .select('*')
      .order('last_accessed', { ascending: false })
      .limit(MAX_MEMORIES);

    if (error || !memories) {
      console.error('[DeepMemory] Retrieve error:', error);
      return [];
    }

    const scored: RetrievedMemory[] = [];

    for (const mem of memories) {
      try {
        const emb = typeof mem.embedding === 'string' 
          ? JSON.parse(mem.embedding) 
          : mem.embedding;
        
        const similarity = this.cosineSimilarity(queryEmbedding, emb);
        
        if (similarity >= minSimilarity) {
          scored.push({
            entry: mem as unknown as MemoryEntry,
            similarity,
          });
        }
      } catch {
        continue;
      }
    }

    // Sort and return top K
    scored.sort((a, b) => b.similarity - a.similarity);
    
    const results = scored.slice(0, K);

    // Update access stats
    for (const result of results) {
      await this.updateAccess(result.entry.id);
    }

    return results;
  }

  /**
   * Inject semantic context into LLM
   */
  async injectContext(query: string): Promise<string> {
    const memories = await this.retrieve(query, 5, 0.4);
    
    if (memories.length === 0) {
      return '';
    }

    const contextParts = memories.map(m => {
      const type = m.entry.type.toUpperCase();
      const content = m.entry.content;
      const sim = (m.similarity * 100).toFixed(0);
      return `[${type} ${sim}%] ${content}`;
    });

    return `## Deep Memories\n${contextParts.join('\n')}\n`;
  }

  /**
   * Get all beliefs
   */
  async getBeliefs(): Promise<MemoryEntry[]> {
    const { data: beliefs } = await this.db
      .from('deep_memories')
      .select('*')
      .eq('type', 'belief')
      .order('strength', { ascending: false })
      .limit(100);

    return (beliefs || []) as unknown as MemoryEntry[];
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{ total: number; beliefs: number; experiences: number; avgStrength: number }> {
    const { count: total } = await this.db
      .from('deep_memories')
      .select('id', { count: 'exact', head: true });

    const { count: beliefs } = await this.db
      .from('deep_memories')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'belief');

    const { count: experiences } = await this.db
      .from('deep_memories')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'experience');

    return {
      total: total || 0,
      beliefs: beliefs || 0,
      experiences: experiences || 0,
      avgStrength: 0.5, // Simplified
    };
  }

  // Private helpers

  private cosineSimilarity(a: Embedding, b: Embedding): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i];
      const valB = b[i];
      if (valA === undefined || valB === undefined) continue;
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  private async updateAccess(id: string): Promise<void> {
    await this.db
      .from('deep_memories')
      .update({ 
        last_accessed: Date.now(),
      })
      .eq('id', id);
  }
}

/**
 * Global singleton
 */
export const deepMemory = new DeepMemory();