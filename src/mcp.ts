import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';
import { getToolDefinition, SessionContext, AgentRole } from './types.js';
import { sessionRegistry } from './sessions.js';
import { getAgent, touchAgent } from './db.js';

export function createMcpServer(sessionId: string, initialCtx?: Partial<SessionContext>): { server: Server, ctx: SessionContext } {
  const server = new Server({
    name: 'universal-ai-bridge-mcp',
    version: '1.0.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  const ctx: SessionContext = {
    sessionId,
    agentId: initialCtx?.agentId || null,
    modelName: initialCtx?.modelName,
    clientLocation: initialCtx?.clientLocation,
    agentType: initialCtx?.agentType,
    directory: initialCtx?.directory,
    role: initialCtx?.role || 'Unassigned',
    provider: initialCtx?.provider || 'AI',
    activeProject: initialCtx?.activeProject || null,
    isExplicitlyConnected: initialCtx?.isExplicitlyConnected || false
  };

  server.setRequestHandler(InitializeRequestSchema, async (request) => {
    const clientInfo = request.params?.clientInfo;
    if (clientInfo?.name) {
      sessionRegistry.updateClientInfo(sessionId, clientInfo.name, clientInfo.version || '1.0.0');
    }

    const res = await (server as any)._oninitialize(request);

    const session = sessionRegistry.getSessionByTransportId(sessionId);
    if (session) {
      ctx.agentId = session.agentId;
      ctx.modelName = session.modelName;
      ctx.clientLocation = session.clientLocation;
      ctx.agentType = session.agentType;
      ctx.directory = session.directory;
      ctx.role = session.role;
      ctx.provider = session.provider;
      ctx.activeProject = session.activeProject;
      ctx.isExplicitlyConnected = session.isExplicitlyConnected;
    }

    return res;
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(getToolDefinition)
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    sessionRegistry.touchSession(sessionId);

    // Keep session context in sync with session registry
    const active = sessionRegistry.getSessionByTransportId(sessionId);
    if (active) {
      ctx.agentId = active.agentId;
      ctx.modelName = active.modelName;
      ctx.clientLocation = active.clientLocation;
      ctx.agentType = active.agentType;
      ctx.directory = active.directory;
      ctx.role = active.role;
      ctx.provider = active.provider;
      ctx.activeProject = active.activeProject;
      ctx.isExplicitlyConnected = active.isExplicitlyConnected;
    }

    // Resolve persistent logical agent identity:
    // Priority 1: Explicit agent_id argument from tool call (supports stateless clients like ChatGPT Web)
    // Priority 2: In-memory transport session agentId (supports stateful clients like Antigravity IDE)
    const rawArgs = (request.params.arguments || {}) as Record<string, any>;
    const effectiveAgentId = (typeof rawArgs.agent_id === 'string' && rawArgs.agent_id.trim()) 
      ? rawArgs.agent_id.trim() 
      : ctx.agentId;

    if (effectiveAgentId) {
      const dbAgent = getAgent(effectiveAgentId);
      if (dbAgent && dbAgent.is_explicitly_connected === 1) {
        ctx.agentId = dbAgent.id;
        ctx.modelName = dbAgent.model_name || ctx.modelName;
        ctx.clientLocation = dbAgent.client_location || ctx.clientLocation;
        ctx.agentType = dbAgent.agent_type || ctx.agentType;
        ctx.directory = dbAgent.directory || ctx.directory;
        ctx.role = (dbAgent.role as AgentRole) || ctx.role;
        ctx.provider = dbAgent.provider || ctx.provider;
        ctx.activeProject = dbAgent.current_project || ctx.activeProject;
        ctx.isExplicitlyConnected = true;

        touchAgent(dbAgent.id);

        if (active) {
          active.agentId = dbAgent.id;
          active.isExplicitlyConnected = true;
          active.role = ctx.role;
          active.activeProject = ctx.activeProject;
          active.modelName = ctx.modelName;
          active.clientLocation = ctx.clientLocation;
        }
      }
    }

    const tool = allTools.find(t => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    // Structured logging for MCP request tracing without logging secrets
    console.log(`[MCP] tool=${tool.name} agent_id=${ctx.agentId || 'unauthenticated'} role=${ctx.role} session=${sessionId.slice(0, 8)}...`);

    // Explicit connection enforcement: Agents must call connect_to_mpc first before calling other tools
    if (!ctx.isExplicitlyConnected && tool.name !== 'connect_to_mpc' && tool.name !== 'get_server_status') {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Unauthorized: You must call 'connect_to_mpc' first with your model_name, client_location, and directory (or provide your assigned 'agent_id') before using '${tool.name}'.`
        }]
      };
    }

    try {
      const args = tool.schema.parse(request.params.arguments || {});
      return await tool.handler(args, ctx);
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error in ${tool.name}: ${e.message || String(e)}` }]
      };
    }
  });

  return { server, ctx };
}
