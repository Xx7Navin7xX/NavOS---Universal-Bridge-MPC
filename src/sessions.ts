import { Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AgentRole, AgentType, AgentRecord } from './types.js';
import {
  connectAgent,
  getAgent,
  getAllAgents,
  getExplicitlyConnectedAgents,
  setAgentStatus,
  setAgentRole,
  setAgentProject,
  setProjectAgentRole,
  touchAgent,
  logActivity
} from './db.js';

export interface ActiveSession {
  sessionId: string;
  agentId: string | null;
  modelName?: string;
  clientLocation?: string;
  agentType?: AgentType;
  directory?: string | null;
  clientName: string;
  clientVersion: string;
  clientRawName?: string;
  role: AgentRole;
  provider: string;
  activeProject: string | null;
  transport: SSEServerTransport | StreamableHTTPServerTransport | any;
  connectedAt: Date;
  lastSeen: Date;
  isExplicitlyConnected: boolean;
  headers?: Record<string, any>;
  query?: Record<string, any>;
  requestedAgent?: string | null;
  isSseStream?: boolean;
}

export function inferProviderFromClient(clientName: string, currentProvider: string = 'AI'): string {
  const lower = clientName.toLowerCase();
  if (lower.includes('chatgpt') || lower.includes('openai') || lower.includes('codex')) return 'OpenAI';
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Anthropic';
  if (lower.includes('antigravity') || lower.includes('gemini') || lower.includes('google')) return 'Google Gemini';
  if (lower.includes('kiro')) return 'Kiro AI';
  if (lower.includes('cursor')) return 'Cursor';
  return currentProvider;
}

class SessionRegistry {
  private sessions = new Map<string, ActiveSession>();
  private dashboardClients = new Set<Response>();
  private agentCounter = 0;
  private pendingDisconnectTimers = new Map<string, NodeJS.Timeout>();
  private gracePeriodSeconds = 45; // Default: 45s grace period for SSE transport drops

  constructor() {
    this.initAgentCounter();
  }

  public setGracePeriod(seconds: number): void {
    this.gracePeriodSeconds = Math.max(0, seconds);
  }

  public getGracePeriod(): number {
    return this.gracePeriodSeconds;
  }

  public clearGraceTimers(): void {
    for (const timer of this.pendingDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingDisconnectTimers.clear();
  }

  private initAgentCounter(): void {
    try {
      const all = getAllAgents();
      let maxNum = 0;
      for (const a of all) {
        const match = a.id.match(/^agent-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      this.agentCounter = maxNum;
    } catch {
      this.agentCounter = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Dashboard SSE Stream
  // -------------------------------------------------------------------------
  public addDashboardClient(res: Response): void {
    this.dashboardClients.add(res);
  }

  public removeDashboardClient(res: Response): void {
    this.dashboardClients.delete(res);
  }

  public broadcast(eventType: string, data: any): void {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.dashboardClients) {
      try {
        client.write(payload);
      } catch (err) {
        this.dashboardClients.delete(client);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Transport Session Registration (Anonymous until connect_to_mpc)
  // -------------------------------------------------------------------------
  public registerSession(
    sessionId: string,
    transport: SSEServerTransport | StreamableHTTPServerTransport | any,
    requestedAgentId?: string | null,
    headers?: Record<string, any>,
    query?: Record<string, any>,
    isSseStream: boolean = false
  ): ActiveSession {
    const activeSession: ActiveSession = {
      sessionId,
      agentId: null,
      clientName: 'Unidentified Client',
      clientVersion: '1.0.0',
      role: 'Unassigned',
      provider: 'AI',
      activeProject: null,
      transport,
      connectedAt: new Date(),
      lastSeen: new Date(),
      isExplicitlyConnected: false,
      headers,
      query,
      requestedAgent: requestedAgentId,
      isSseStream
    };

    this.sessions.set(sessionId, activeSession);
    return activeSession;
  }

  // -------------------------------------------------------------------------
  // Explicit Agent Connection (connect_to_mpc) with Persistent Identity Re-Binding
  // -------------------------------------------------------------------------
  public connectMpcSession(
    sessionId: string,
    params: {
      modelName: string;
      clientLocation: string;
      directory?: string | null;
      agentId?: string | null;
    }
  ): { session: ActiveSession; agent: any } {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.registerSession(sessionId, null);
    }

    const modelName = params.modelName.trim();
    const clientLocation = params.clientLocation.trim();
    const rawDir = params.directory ? params.directory.trim() : null;
    const hasDir = rawDir !== null && rawDir !== '' && rawDir.toLowerCase() !== 'nil';
    const directory = hasDir ? rawDir : null;
    const agentType: AgentType = directory ? 'NATIVE' : 'WEB';

    const requestedAgentId = params.agentId ? params.agentId.trim() : null;
    let agentId: string;
    let roleToUse: AgentRole = session.role || 'Unassigned';
    let projectToUse: string | null = session.activeProject;

    if (requestedAgentId) {
      // Re-bind to existing agent identity
      const existingDb = getAgent(requestedAgentId);
      if (existingDb) {
        agentId = existingDb.id;
        roleToUse = (existingDb.role as AgentRole) || roleToUse;
        projectToUse = existingDb.current_project || projectToUse;

        // Retire any older transport session previously mapped to this agentId
        for (const [sId, s] of this.sessions.entries()) {
          if (sId !== sessionId && s.agentId === agentId) {
            s.agentId = null;
            s.isExplicitlyConnected = false;
            if (!this.isPersistentStream(s)) {
              this.sessions.delete(sId);
            }
          }
        }
      } else {
        // Agent ID specified by client doesn't exist yet, register with that ID
        agentId = requestedAgentId;
      }
    } else {
      // Check if current session already has an agentId allocated
      agentId = session.agentId || '';
      if (!agentId) {
        this.agentCounter++;
        agentId = `agent-${this.agentCounter}`;
        // Ensure no collision with DB or other active sessions
        while (getAgent(agentId) || Array.from(this.sessions.values()).some(s => s.agentId === agentId && s.sessionId !== sessionId)) {
          this.agentCounter++;
          agentId = `agent-${this.agentCounter}`;
        }
      }
    }

    // Clear any pending disconnect grace period timer for this agent
    const pendingTimer = this.pendingDisconnectTimers.get(agentId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingDisconnectTimers.delete(agentId);
    }

    const provider = inferProviderFromClient(clientLocation);

    // Save/update in SQLite
    const agentRecord = connectAgent({
      id: agentId,
      sessionId,
      modelName,
      clientLocation,
      agentType,
      directory,
      provider,
      role: roleToUse,
      currentProject: projectToUse
    });

    session.agentId = agentId;
    session.modelName = modelName;
    session.clientLocation = clientLocation;
    session.agentType = agentType;
    session.directory = directory;
    session.clientName = clientLocation;
    session.provider = provider;
    session.role = roleToUse;
    session.activeProject = projectToUse;
    session.isExplicitlyConnected = true;
    session.lastSeen = new Date();

    logActivity('agent_connected', `Agent '${agentId}' connected: ${modelName} (${clientLocation}, ${agentType}${directory ? `, ${directory}` : ''})`, agentId, {
      agentId,
      modelName,
      clientLocation,
      agentType,
      directory,
      sessionId
    });

    this.broadcast('agent_connected', {
      agentId,
      sessionId,
      modelName,
      clientLocation,
      agentType,
      directory,
      role: session.role,
      activeProject: session.activeProject,
      status: 'Connected'
    });

    return { session, agent: agentRecord };
  }

  // -------------------------------------------------------------------------
  // Persistent Stream Detection & Stale Transport Reaping
  // -------------------------------------------------------------------------
  public isPersistentStream(session: ActiveSession): boolean {
    if (!session) return false;
    if (session.isSseStream) {
      const res = (session.transport as any)?.res || (session.transport as any)?._res;
      if (res && typeof res.writableEnded === 'boolean') {
        return res.writableEnded === false && !res.destroyed;
      }
      return true;
    }
    return false;
  }

  public reapStaleTransportSessions(maxIdleSeconds: number = 1800): number {
    const now = Date.now();
    let reapedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // 1. NEVER reap active persistent streams (e.g. Antigravity SSE connection)
      if (this.isPersistentStream(session)) {
        continue;
      }

      // 2. Check idle time for stateless HTTP sessions
      const idleSeconds = (now - new Date(session.lastSeen).getTime()) / 1000;
      if (idleSeconds > maxIdleSeconds) {
        const agentId = session.agentId;
        this.sessions.delete(sessionId);
        reapedCount++;

        // If this logical agent has no remaining active session, mark Disconnected in DB
        if (agentId) {
          const hasOtherSession = Array.from(this.sessions.values()).some(s => s.agentId === agentId);
          if (!hasOtherSession) {
            const pendingTimer = this.pendingDisconnectTimers.get(agentId);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              this.pendingDisconnectTimers.delete(agentId);
            }
            setAgentStatus(agentId, 'Disconnected');
            this.broadcast('agent_disconnected', { agentId, sessionId, status: 'Disconnected' });
          }
        }
      }
    }

    return reapedCount;
  }

  // -------------------------------------------------------------------------
  // Logical Connected Agents (Deduplicated 1-to-1 Logical Agent View)
  // -------------------------------------------------------------------------
  public getLogicalConnectedAgents(): Array<{ session: ActiveSession | undefined; agent: AgentRecord }> {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.isExplicitlyConnected && s.agentId !== null);
    const activeAgentMap = new Map<string, ActiveSession>();

    for (const session of activeSessions) {
      if (session.agentId) {
        const existing = activeAgentMap.get(session.agentId);
        if (!existing || session.lastSeen > existing.lastSeen) {
          activeAgentMap.set(session.agentId, session);
        }
      }
    }

    const result: Array<{ session: ActiveSession | undefined; agent: AgentRecord }> = [];
    const seenAgentIds = new Set<string>();

    for (const [agentId, session] of activeAgentMap.entries()) {
      const dbAgent = getAgent(agentId);
      if (dbAgent && dbAgent.is_explicitly_connected === 1) {
        result.push({ session, agent: dbAgent });
        seenAgentIds.add(agentId);
      }
    }

    // Include explicitly connected agents from SQLite marked Connected that are between stateless turns
    const dbAgents = getExplicitlyConnectedAgents();
    for (const dbAgent of dbAgents) {
      if (!seenAgentIds.has(dbAgent.id)) {
        result.push({ session: undefined, agent: dbAgent });
        seenAgentIds.add(dbAgent.id);
      }
    }

    return result;
  }

  public updateClientInfo(sessionId: string, rawClientName: string, clientVersion: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.clientRawName = rawClientName;
    session.clientVersion = clientVersion || session.clientVersion || '1.0.0';
  }

  public unregisterSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const wasSseStream = session.isSseStream === true;
    this.sessions.delete(sessionId);

    if (session.isExplicitlyConnected && session.agentId) {
      const agentId = session.agentId;
      const hasOtherSession = Array.from(this.sessions.values()).some(s => s.agentId === agentId);

      // When an SSE transport closes, do NOT instantly mark the logical agent Disconnected.
      // Give it a reconnect grace period (30–60s, default 45s) to allow transparent client reconnection.
      if (!hasOtherSession && wasSseStream) {
        if (this.gracePeriodSeconds > 0) {
          const existingTimer = this.pendingDisconnectTimers.get(agentId);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const modelLabel = session.modelName || session.clientLocation || 'unknown';
          const timer = setTimeout(() => {
            this.pendingDisconnectTimers.delete(agentId);
            const currentlyActive = Array.from(this.sessions.values()).some(s => s.agentId === agentId);
            if (!currentlyActive) {
              setAgentStatus(agentId, 'Disconnected');
              logActivity('agent_disconnected', `Agent '${agentId}' (${modelLabel}) disconnected after grace period`, agentId);
              this.broadcast('agent_disconnected', {
                agentId,
                sessionId,
                status: 'Disconnected'
              });
            }
          }, this.gracePeriodSeconds * 1000);

          this.pendingDisconnectTimers.set(agentId, timer);
        } else {
          setAgentStatus(agentId, 'Disconnected');
          logActivity('agent_disconnected', `Agent '${agentId}' (${session.modelName || session.clientLocation || 'unknown'}) disconnected`, agentId);
          this.broadcast('agent_disconnected', {
            agentId,
            sessionId,
            status: 'Disconnected'
          });
        }
      }
    }
  }

  public deleteAgentSessions(agentId: string): void {
    const pendingTimer = this.pendingDisconnectTimers.get(agentId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingDisconnectTimers.delete(agentId);
    }

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.agentId === agentId) {
        if (session.transport && typeof session.transport.close === 'function') {
          try {
            session.transport.close();
          } catch {}
        }
        this.sessions.delete(sessionId);
      }
    }
  }

  public getSessionByTransportId(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionByAgentId(agentId: string): ActiveSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) return session;
    }
    return undefined;
  }

  public getAllActiveSessions(): ActiveSession[] {
    // Return explicitly connected sessions only
    return Array.from(this.sessions.values()).filter(s => s.isExplicitlyConnected && s.agentId !== null);
  }

  public clearAllSessions(): void {
    this.clearGraceTimers();
    for (const session of this.sessions.values()) {
      try {
        if (session.transport && typeof session.transport.close === 'function') {
          session.transport.close();
        }
      } catch {}
    }
    this.sessions.clear();
  }

  public updateAgentRole(agentId: string, role: AgentRole): boolean {
    setAgentRole(agentId, role);
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) {
        session.role = role;
      }
    }
    logActivity('role_changed', `Agent '${agentId}' role changed to '${role}'`, agentId, { role });
    this.broadcast('agent_updated', { agentId, role });
    return true;
  }

  public updateAgentProjectRole(agentId: string, project: string, role: AgentRole): boolean {
    setProjectAgentRole(project, agentId, role);
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) {
        session.activeProject = project;
        session.role = role;
      }
    }
    logActivity('role_assigned', `Agent '${agentId}' assigned to project '${project}' as '${role}'`, agentId, { project, role });
    this.broadcast('agent_updated', { agentId, activeProject: project, role });
    this.broadcast('project_updated', { project });
    return true;
  }

  public updateAgentProject(agentId: string, project: string | null): boolean {
    setAgentProject(agentId, project);
    for (const session of this.sessions.values()) {
      if (session.agentId === agentId) {
        session.activeProject = project;
      }
    }
    logActivity('project_assigned', `Agent '${agentId}' assigned to project '${project || 'None'}'`, agentId, { project });
    this.broadcast('agent_updated', { agentId, activeProject: project });
    return true;
  }

  public touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeen = new Date();
      if (session.agentId) {
        const pendingTimer = this.pendingDisconnectTimers.get(session.agentId);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          this.pendingDisconnectTimers.delete(session.agentId);
        }
        touchAgent(session.agentId);
      }
    }
  }
}

export const sessionRegistry = new SessionRegistry();
