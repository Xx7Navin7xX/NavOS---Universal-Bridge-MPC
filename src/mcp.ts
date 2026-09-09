import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';
import { getToolDefinition, SessionContext } from './types.js';
import { sessionRegistry } from './sessions.js';

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

    const tool = allTools.find(t => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    // Explicit connection enforcement: Agents must call connect_to_mpc first before calling other tools
    if (!ctx.isExplicitlyConnected && tool.name !== 'connect_to_mpc' && tool.name !== 'get_server_status') {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Unauthorized: You must call 'connect_to_mpc' first with your model_name, client_location, and directory before using '${tool.name}'.`
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
