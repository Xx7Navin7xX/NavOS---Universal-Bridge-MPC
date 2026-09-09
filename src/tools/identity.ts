import { z } from 'zod';
import { McpTool } from '../types.js';
import {
  getAllAgents,
  getCurrentPhase
} from '../db.js';
import { sessionRegistry } from '../sessions.js';

// ---------------------------------------------------------------------------
// 1. connect_to_mpc
// ---------------------------------------------------------------------------
export const connectToMpcTool: McpTool = {
  name: 'connect_to_mpc',
  description: 'Explicitly registers your agent identity with NavOS AI Bridge. MUST be called first by every agent upon connecting before participating in projects. Specify your exact model_name, client_location, and local workspace directory (or null/nil if running in a web browser without local filesystem access).',
  schema: z.object({
    model_name: z.string().describe('Exact AI model name (e.g. "Gemini 3.8 Flash", "GPT-5.6 Luna", "Claude 3.5 Sonnet")'),
    client_location: z.string().describe('Client runtime environment (e.g. "Antigravity IDE", "Antigravity CLI", "Codex VS Code", "Codex CLI", "ChatGPT Web PC", "Gemini Web")'),
    directory: z.string().nullable().optional().describe('Absolute local workspace path if NATIVE agent (e.g. "C:\\Projects\\MyApp" or "/home/user/project"). Pass null or omit if WEB agent.')
  }),
  handler: async ({ model_name, client_location, directory }, ctx) => {
    try {
      const { session, agent } = sessionRegistry.connectMpcSession(ctx.sessionId, {
        modelName: model_name,
        clientLocation: client_location,
        directory: directory || null
      });

      // Update in-memory session context
      ctx.agentId = agent.id;
      ctx.modelName = agent.model_name;
      ctx.clientLocation = agent.client_location;
      ctx.agentType = agent.agent_type;
      ctx.directory = agent.directory;
      ctx.role = agent.role as any;
      ctx.isExplicitlyConnected = true;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            agent_id: agent.id,
            model_name: agent.model_name,
            client_location: agent.client_location,
            agent_type: agent.agent_type,
            directory: agent.directory,
            role: agent.role,
            status: 'Connected',
            message: `Agent successfully connected as ${agent.agent_type} agent (${agent.model_name} in ${agent.client_location}). Role assignment is controlled by the human user via the NavOS dashboard.`
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to connect to NavOS: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 2. get_agents
// ---------------------------------------------------------------------------
export const getAgentsTool: McpTool = {
  name: 'get_agents',
  description: 'Returns all explicitly connected agents, their model name, client runtime, agent type (NATIVE or WEB), workspace directory, assigned role, and current project.',
  schema: z.object({
    project: z.string().optional().describe('Filter agents by registered project name')
  }),
  handler: async ({ project }) => {
    const allAgents = getAllAgents();
    const activeSessions = sessionRegistry.getAllActiveSessions();
    const activeMap = new Map(activeSessions.map(s => [s.agentId, s]));

    // Only return explicitly connected agents
    let list = allAgents
      .filter(a => activeMap.has(a.id))
      .map(a => {
        const active = activeMap.get(a.id);
        const currentPhase = a.current_project ? getCurrentPhase(a.current_project) : null;
        return {
          agent_id: a.id,
          model_name: a.model_name || a.id,
          client_location: a.client_location || a.client_name || 'Unknown',
          agent_type: a.agent_type || (a.directory ? 'NATIVE' : 'WEB'),
          directory: a.directory || null,
          connection_status: 'Connected',
          registered_projects: a.current_project ? [a.current_project] : [],
          assigned_role: active?.role || a.role || 'Unassigned',
          current_phase_activity: currentPhase ? `Phase ${currentPhase.phase_number}: ${currentPhase.title} (${currentPhase.status})` : 'Idle'
        };
      });

    if (project) {
      list = list.filter(a => a.registered_projects.includes(project));
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(list, null, 2)
      }]
    };
  }
};

export const identityTools: McpTool[] = [
  connectToMpcTool,
  getAgentsTool
];
