export interface SwarmPeer {
  id: string;
  name: string;
  url: string;
  capabilities: string[];
  isLeader: boolean;
  lastSeen: number;
  status: 'connected' | 'disconnected';
}

export interface SwarmMessage {
  from: string;
  to?: string;
  type: 'task' | 'sync' | 'chat' | 'leader_vote' | 'intro';
  payload: any;
  timestamp: number;
}

export class SwarmManager {
  private peers = new Map<string, SwarmPeer>();
  private localId: string;
  private localUrl: string;
  private capabilities: string[];
  private leaderId: string | null = null;
  private ws: WebSocket | null = null;

  constructor(localId?: string, localUrl?: string, capabilities?: string[]) {
    this.localId = localId || `node-${Date.now()}`;
    this.localUrl = localUrl || 'ws://localhost:3142';
    this.capabilities = capabilities || ['browser', 'llm', 'desktop'];
  }

  async connect(peerUrl: string): Promise<void> {
    const ws = new WebSocket(`${peerUrl}/swarm`);
    
    ws.onopen = () => {
      this.send({
        type: 'intro',
        from: this.localId,
        payload: { id: this.localId, url: this.localUrl, capabilities: this.capabilities },
        timestamp: Date.now(),
      });
    };
    
    ws.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };
    
    this.ws = ws;
  }

  private send(message: SwarmMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(message: SwarmMessage): void {
    switch (message.type) {
      case 'intro':
        this.addPeer(message.payload as SwarmPeer);
        break;
      case 'leader_vote':
        this.electLeader();
        break;
      case 'sync':
        this.handleSync(message.payload);
        break;
      case 'task':
        this.handleTask(message.payload);
        break;
    }
  }

  private addPeer(peer: SwarmPeer): void {
    this.peers.set(peer.id, peer);
    if (peer.isLeader) {
      this.leaderId = peer.id;
    }
  }

  private electLeader(): void {
    const peerList = Array.from(this.peers.values());
    peerList.push({
      id: this.localId,
      name: this.localId,
      url: this.localUrl,
      capabilities: this.capabilities,
      isLeader: false,
      lastSeen: Date.now(),
      status: 'connected',
    });

    peerList.sort((a, b) => {
      const capScore = (p: SwarmPeer) => p.capabilities.length;
      return capScore(b) - capScore(a);
    });

    this.leaderId = peerList[0]?.id || null;
    
    this.send({ 
      type: 'leader_vote', 
      from: this.localId,
      payload: { leader: this.leaderId }, 
      timestamp: Date.now() 
    });
  }

  private handleSync(data: any): void {
    console.log('[Swarm] Received sync data:', data);
  }

  private handleTask(data: any): void {
    console.log('[Swarm] Received task:', data);
  }

  async assignTask(task: any, targetId?: string): Promise<void> {
    const payload = { task, targetId };
    this.send({ 
      type: 'task', 
      from: this.localId,
      payload, 
      timestamp: Date.now() 
    });
  }

  getPeers(): SwarmPeer[] {
    return Array.from(this.peers.values());
  }

  getLeader(): SwarmPeer | null {
    if (!this.leaderId) return null;
    return this.peers.get(this.leaderId) || null;
  }

  disconnect(): void {
    this.ws?.close();
  }
}

let instance: SwarmManager | null = null;

export function getSwarmManager(): SwarmManager {
  if (!instance) {
    instance = new SwarmManager();
  }
  return instance;
}