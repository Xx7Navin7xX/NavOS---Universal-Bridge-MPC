import { Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AgentRole, AgentType, SessionContext } from './types.js';
import {
  connectAgent,
  getAgent,
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
    query?: Record<string, any>
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
      requestedAgent: requestedAgentId
    };

    this.sessions.set(sessionId, activeSession);
    return activeSession;
  }

  // -------------------------------------------------------------------------
  // Explicit Agent Connection (connect_to_mpc)
  // -------------------------------------------------------------------------
  public connectMpcSession(
    sessionId: string,
    params: {
      modelName: string;
      clientLocation: string;
      directory?: string | null;
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

    // Allocate an internal agent ID if not yet assigned
    let agentId = session.agentId;
    if (!agentId) {
      this.agentCounter++;
      agentId = `agent-${this.agentCounter}`;
      // Check collision
      while (Array.from(this.sessions.values()).some(s => s.agentId === agentId && s.sessionId !== sessionId)) {
        this.agentCounter++;
        agentId = `agent-${this.agentCounter}`;
      }
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
      role: session.role || 'Unassigned',
      currentProject: session.activeProject
    });

    session.agentId = agentId;
    session.modelName = modelName;
    session.clientLocation = clientLocation;
    session.agentType = agentType;
    session.directory = directory;
    session.clientName = clientLocation;
    session.provider = provider;
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

  public updateClientInfo(sessionId: string, rawClientName: string, clientVersion: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.clientRawName = rawClientName;
    session.clientVersion = clientVersion || session.clientVersion || '1.0.0';
  }

  public unregisterSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);

    if (session.isExplicitlyConnected && session.agentId) {
      setAgentStatus(session.agentId, 'Disconnected');

      logActivity('agent_disconnected', `Agent '${session.agentId}' (${session.modelName || session.clientLocation || 'unknown'}) disconnected`, session.agentId);

      this.broadcast('agent_disconnected', {
        agentId: session.agentId,
        sessionId,
        status: 'Disconnected'
      });
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
        touchAgent(session.agentId);
      }
    }
  }

  public createSessionContext(session: ActiveSession): SessionContext {
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      modelName: session.modelName,
      clientLocation: session.clientLocation,
      agentType: session.agentType,
      directory: session.directory,
      role: session.role,
      provider: session.provider,
      activeProject: session.activeProject,
      isExplicitlyConnected: session.isExplicitlyConnected
    };
  }
}

export const sessionRegistry = new SessionRegistry();
