/**
 * Sidecar Manager
 *
 * Brain-side service that manages sidecar enrollment, authentication,
 * and connection tracking. Handles ES256 key pair lifecycle and JWT signing.
 * Refactored to use async vault/sidecars.ts and Supabase.
 */

import { generateKeyPair, exportJWK, exportPKCS8, exportSPKI, importPKCS8, importSPKI, SignJWT, jwtVerify, type JWK } from 'jose';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ServerWebSocket } from 'bun';
import type { Service, ServiceStatus } from '../daemon/services.ts';
import { generateId } from '../vault/schema.ts';
import * as SidecarVault from '../vault/sidecars.ts';
import type {
  SidecarRecord,
  SidecarInfo,
  SidecarTokenClaims,
  ConnectedSidecar,
  SidecarCapability,
  UnavailableCapability,
} from './types.ts';
import type { RPCRequest, RPCTimeouts, SidecarEvent, RPCResultPayload, RPCErrorPayload, RPCProgressPayload } from './protocol.ts';
import { DEFAULT_RPC_TIMEOUTS } from './protocol.ts';
import { EventScheduler } from './scheduler.ts';
import { RPCTracker } from './rpc.ts';
import { SidecarConnection } from './connection.ts';

const ALG = 'ES256';
const KEY_DIR_NAME = 'sidecar-keys';
const PRIVATE_KEY_FILE = 'private.pem';
const PUBLIC_KEY_FILE = 'public.pem';

export class SidecarManager implements Service {
  readonly name = 'sidecar-manager';

  private privateKey: CryptoKey | null = null;
  private publicKey: CryptoKey | null = null;
  private publicJwk: JWK | null = null;
  private keyId: string = '';
  private dataDir: string;
  private brainUrl: string = '';
  private _status: ServiceStatus = 'stopped';

  /** Runtime map of connected sidecars (not persisted) */
  private connected = new Map<string, ConnectedSidecar>();

  /** Protocol infrastructure */
  private scheduler: EventScheduler;
  private rpcTracker: RPCTracker;
  private sidecarConnections = new Map<string, SidecarConnection>();
  private progressListeners = new Set<(sidecarId: string, rpcId: string, progress: number, message?: string) => void>();
  private eventListeners = new Set<(sidecarId: string, event: SidecarEvent) => void>();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.scheduler = new EventScheduler();
    this.rpcTracker = new RPCTracker();
  }

  /**
   * Set the brain's external URL (used in JWT claims).
   * Must be called before enrolling sidecars.
   */
  setBrainUrl(url: string): void {
    this.brainUrl = url;
  }

  // --------------- Service Interface ---------------

  async start(): Promise<void> {
    this._status = 'starting';
    try {
      await this.loadOrGenerateKeys();

      // Wire scheduler handlers
      this.scheduler.on('rpc_result', async (sidecarId, event) => {
        const payload = event.payload as RPCResultPayload | RPCErrorPayload;
        if (payload.error) {
          this.rpcTracker.fail(payload.rpc_id, new Error(`${payload.error.code}: ${payload.error.message}`));
        } else {
          const result = payload.result as Record<string, unknown> | undefined;
          if (event.binary && result && typeof result === 'object') {
            (result as Record<string, unknown>)._binary = event.binary;
          }
          this.rpcTracker.resolve(payload.rpc_id, result);
        }
      });

      this.scheduler.on('rpc_progress', async (sidecarId, event) => {
        const payload = event.payload as RPCProgressPayload;
        for (const listener of this.progressListeners) {
          listener(sidecarId, payload.rpc_id, payload.progress, payload.message);
        }
      });

      const sidecarEventTypes = ['screen_capture', 'context_changed', 'idle_detected', 'clipboard_change'];
      const sidecarEventHandler = async (sidecarId: string, event: SidecarEvent) => {
        for (const listener of this.eventListeners) {
          listener(sidecarId, event);
        }
      };
      for (const type of sidecarEventTypes) {
        this.scheduler.on(type, sidecarEventHandler);
      }

      this.rpcTracker.onDetachedComplete((rpcId, result, error) => {
        if (error) {
          console.warn(`[SidecarManager] Detached RPC ${rpcId} failed:`, error.message);
        } else {
          console.log(`[SidecarManager] Detached RPC ${rpcId} completed`);
        }
      });

      this.scheduler.start();

      this._status = 'running';
      console.log('[SidecarManager] Started — keys loaded, scheduler running');
    } catch (err) {
      this._status = 'error';
      throw err;
    }
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
    this.scheduler.stop();
    for (const [id, conn] of this.sidecarConnections) {
      this.rpcTracker.failAll(id, 'manager stopping');
      conn.close();
    }
    this.sidecarConnections.clear();
    this.privateKey = null;
    this.publicKey = null;
    this.publicJwk = null;
    this.connected.clear();
    this._status = 'stopped';
    console.log('[SidecarManager] Stopped');
  }

  status(): ServiceStatus {
    return this._status;
  }

  // --------------- Key Management ---------------

  private get keysDir(): string {
    return path.join(this.dataDir, KEY_DIR_NAME);
  }

  private get privateKeyPath(): string {
    return path.join(this.keysDir, PRIVATE_KEY_FILE);
  }

  private get publicKeyPath(): string {
    return path.join(this.keysDir, PUBLIC_KEY_FILE);
  }

  private async loadOrGenerateKeys(): Promise<void> {
    if (existsSync(this.privateKeyPath) && existsSync(this.publicKeyPath)) {
      await this.loadKeys();
      console.log('[SidecarManager] Loaded existing ES256 key pair');
    } else {
      await this.generateKeys();
      console.log('[SidecarManager] Generated new ES256 key pair');
    }

    this.publicJwk = await exportJWK(this.publicKey!);
    this.keyId = this.publicJwk.x ?? 'default';
  }

  private async generateKeys(): Promise<void> {
    mkdirSync(this.keysDir, { recursive: true });
    const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    const pkcs8 = await exportPKCS8(privateKey);
    const spki = await exportSPKI(publicKey);
    await Bun.write(this.privateKeyPath, pkcs8);
    await Bun.write(this.publicKeyPath, spki);
  }

  private async loadKeys(): Promise<void> {
    const privatePem = await Bun.file(this.privateKeyPath).text();
    const publicPem = await Bun.file(this.publicKeyPath).text();
    this.privateKey = await importPKCS8(privatePem, ALG, { extractable: true });
    this.publicKey = await importSPKI(publicPem, ALG, { extractable: true });
  }

  // --------------- JWKS ---------------

  getJwks(): { keys: JWK[] } {
    if (!this.publicJwk) {
      throw new Error('SidecarManager not started');
    }
    return {
      keys: [
        {
          ...this.publicJwk,
          alg: ALG,
          use: 'sig',
          kid: this.keyId,
        },
      ],
    };
  }

  // --------------- Enrollment ---------------

  async enrollSidecar(name: string): Promise<{ token: string; sidecar: SidecarRecord }> {
    if (!this.privateKey) throw new Error('SidecarManager not started');
    if (!this.brainUrl) throw new Error('Brain URL not configured — call setBrainUrl() first');

    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 64) {
      throw new Error('Sidecar name must be 1-64 characters');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      throw new Error('Sidecar name may only contain letters, numbers, hyphens, and underscores');
    }

    // Check uniqueness
    const existing = await SidecarVault.getSidecarByName(trimmed);
    if (existing) {
      throw new Error(`Sidecar "${trimmed}" is already enrolled`);
    }

    const id = generateId();
    const tokenId = generateId();

    const isSecure = !this.brainUrl.includes('localhost') && !this.brainUrl.match(/:\d+$/);
    const wsProtocol = isSecure ? 'wss' : 'ws';
    const httpProtocol = isSecure ? 'https' : 'http';

    const brainWs = `${wsProtocol}://${this.brainUrl}/sidecar/connect`;
    const jwksUrl = `${httpProtocol}://${this.brainUrl}/api/sidecars/.well-known/jwks.json`;

    const token = await new SignJWT({
      sid: id,
      name: trimmed,
      brain: brainWs,
      jwks: jwksUrl,
    } satisfies Omit<SidecarTokenClaims, 'sub' | 'jti' | 'iat'>)
      .setProtectedHeader({ alg: ALG, kid: this.keyId })
      .setSubject(`sidecar:${id}`)
      .setJti(tokenId)
      .setIssuedAt()
      .sign(this.privateKey);

    await SidecarVault.createSidecar(id, trimmed, tokenId);
    const sidecar = await SidecarVault.getSidecar(id);
    if (!sidecar) throw new Error('Failed to retrieve enrolled sidecar');
    
    console.log(`[SidecarManager] Enrolled sidecar "${trimmed}" (${id})`);
    return { token, sidecar };
  }

  // --------------- Registry (DB queries) ---------------

  /** Get all enrolled sidecars with connection state */
  async listSidecars(): Promise<SidecarInfo[]> {
    const records = await SidecarVault.findSidecars();
    return records.map((r) => this.toSidecarInfo(r));
  }

  /** Get a single sidecar by ID */
  async getSidecar(id: string): Promise<SidecarInfo | null> {
    const record = await SidecarVault.getSidecar(id);
    return record ? this.toSidecarInfo(record) : null;
  }

  /** Revoke a sidecar and remove it from the database. Disconnects if connected. */
  async revokeSidecar(id: string): Promise<boolean> {
    const success = await SidecarVault.deleteSidecar(id);
    if (success) {
      this.connected.delete(id);
      console.log(`[SidecarManager] Revoked and removed sidecar ${id}`);
      return true;
    }
    return false;
  }

  /** Check if a sidecar ID is enrolled (not revoked) */
  async isEnrolled(id: string): Promise<boolean> {
    return SidecarVault.isEnrolled(id);
  }

  /** Update last_seen_at for a sidecar */
  async touchSidecar(id: string): Promise<void> {
    await SidecarVault.touchSidecar(id);
  }

  // --------------- Connection Tracking ---------------

  /** Register a connected sidecar (called after WS handshake + registration message) */
  async registerConnection(sidecar: ConnectedSidecar): Promise<void> {
    this.connected.set(sidecar.id, sidecar);
    await SidecarVault.updateSidecar(sidecar.id, {
      last_seen_at: new Date().toISOString(),
      hostname: sidecar.hostname,
      os: sidecar.os,
      platform: sidecar.platform,
      capabilities: JSON.stringify(sidecar.capabilities),
    });
    console.log(`[SidecarManager] Sidecar connected: ${sidecar.name} (${sidecar.id})`);
  }

  /** Remove a connected sidecar (called on WS close) */
  removeConnection(id: string): void {
    const sc = this.connected.get(id);
    this.connected.delete(id);
    if (sc) {
      console.log(`[SidecarManager] Sidecar disconnected: ${sc.name} (${id})`);
    }
  }

  /** Update capabilities for a connected sidecar (called on config reload) */
  async updateCapabilities(sidecarId: string, capabilities: SidecarCapability[], unavailableCapabilities: UnavailableCapability[] = []): Promise<void> {
    const conn = this.connected.get(sidecarId);
    if (conn) {
      conn.capabilities = capabilities;
      conn.unavailableCapabilities = unavailableCapabilities;
    }
    await SidecarVault.updateSidecar(sidecarId, {
      capabilities: JSON.stringify(capabilities)
    });
    console.log(`[SidecarManager] Capabilities updated for ${sidecarId}: ${capabilities.join(', ')}`);
  }

  /** Get all currently connected sidecars */
  getConnectedSidecars(): ConnectedSidecar[] {
    return Array.from(this.connected.values());
  }

  /** Check if a specific sidecar is connected */
  isConnected(id: string): boolean {
    return this.connected.has(id);
  }

  // --------------- Protocol: Token Validation ---------------

  /**
   * Verify a JWT token and return claims if valid and sidecar is enrolled.
   */
  async validateToken(token: string): Promise<SidecarTokenClaims | null> {
    if (!this.publicKey) return null;
    try {
      const { payload } = await jwtVerify(token, this.publicKey, { algorithms: [ALG] });
      const claims = payload as unknown as SidecarTokenClaims;
      if (!claims.sid || !(await this.isEnrolled(claims.sid))) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  // --------------- Protocol: WebSocket Handlers ---------------

  /** Called when a sidecar WebSocket connects (after JWT validation) */
  async handleSidecarConnect(ws: ServerWebSocket<unknown>, sidecarId: string): Promise<void> {
    const connection = new SidecarConnection(
      sidecarId,
      ws,
      this.scheduler,
      () => this.handleSidecarDisconnect(sidecarId),
    );
    connection.startHeartbeat();
    this.sidecarConnections.set(sidecarId, connection);
    await this.touchSidecar(sidecarId);
    console.log(`[SidecarManager] Sidecar WS connected: ${sidecarId}`);
  }

  /** Route inbound messages to the correct SidecarConnection */
  async handleSidecarMessage(ws: ServerWebSocket<unknown>, message: string | Buffer): Promise<void> {
    const sidecarId = (ws.data as any)?.sidecar_id as string;
    if (!sidecarId) return;

    if (typeof message === 'string') {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'register') {
          const record = await SidecarVault.getSidecar(sidecarId);
          await this.registerConnection({
            id: sidecarId,
            name: record?.name ?? parsed.hostname ?? sidecarId,
            hostname: parsed.hostname ?? 'unknown',
            os: parsed.os ?? 'unknown',
            platform: parsed.platform ?? 'unknown',
            capabilities: parsed.capabilities ?? [],
            unavailableCapabilities: parsed.unavailable_capabilities ?? [],
            connectedAt: new Date(),
          });
          return;
        }
        if (parsed.type === 'capabilities_update') {
          await this.updateCapabilities(sidecarId, parsed.capabilities ?? [], parsed.unavailable_capabilities ?? []);
          return;
        }
      } catch { }
    }

    const connection = this.sidecarConnections.get(sidecarId);
    if (!connection) return;

    if (message instanceof Buffer) {
      connection.handleBinary(message);
    } else {
      connection.handleMessage(message.toString());
    }
  }

  handleSidecarPong(sidecarId: string): void {
    const connection = this.sidecarConnections.get(sidecarId);
    if (connection) {
      connection.handlePong();
    }
  }

  handleSidecarDisconnect(sidecarId: string): void {
    const conn = this.sidecarConnections.get(sidecarId);
    if (conn) {
      conn.close();
      this.sidecarConnections.delete(sidecarId);
    }
    this.scheduler.removeSidecar(sidecarId);
    this.rpcTracker.failAll(sidecarId, 'disconnected');
    this.removeConnection(sidecarId);
  }

  // --------------- Protocol: RPC Dispatch ---------------

  async dispatchRPC(
    sidecarId: string,
    method: string,
    params: Record<string, unknown> = {},
    timeouts: RPCTimeouts = DEFAULT_RPC_TIMEOUTS,
  ): Promise<unknown> {
    const connection = this.sidecarConnections.get(sidecarId);
    if (!connection) {
      throw new Error(`Sidecar ${sidecarId} is not connected`);
    }

    const rpcId = generateId();
    const request: RPCRequest = {
      type: 'rpc_request',
      id: rpcId,
      method,
      params,
    };

    connection.sendRPC(request);
    return this.rpcTracker.dispatch(rpcId, sidecarId, method, timeouts);
  }

  onProgress(listener: (sidecarId: string, rpcId: string, progress: number, message?: string) => void): void {
    this.progressListeners.add(listener);
  }

  onEvent(listener: (sidecarId: string, event: SidecarEvent) => void): void {
    this.eventListeners.add(listener);
  }

  // --------------- Helpers ---------------

  private toSidecarInfo(record: SidecarRecord): SidecarInfo {
    const conn = this.connected.get(record.id);
    const parsedCapabilities = record.capabilities ? JSON.parse(record.capabilities) : undefined;
    return {
      id: record.id,
      name: record.name,
      enrolled_at: record.enrolled_at,
      last_seen_at: record.last_seen_at,
      status: record.status,
      connected: !!conn,
      hostname: conn?.hostname ?? record.hostname ?? undefined,
      os: conn?.os ?? record.os ?? undefined,
      platform: conn?.platform ?? record.platform ?? undefined,
      capabilities: conn?.capabilities ?? parsedCapabilities,
      unavailable_capabilities: conn?.unavailableCapabilities,
    };
  }
}
