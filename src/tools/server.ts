import { z } from 'zod';
import { McpTool } from '../types.js';
import { config } from '../config.js';
import { sessionRegistry } from '../sessions.js';
import { getAllAgents, getAllProjects } from '../db.js';

export const getServerStatusTool: McpTool = {
  name: 'get_server_status',
  description: 'Returns NavOS Universal AI Bridge health, uptime, active connected agents, registered projects, and operational status.',
  schema: z.object({}),
  handler: async () => {
    const activeSessions = sessionRegistry.getAllActiveSessions();
    const allProjects = getAllProjects();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'online',
          server: 'NavOS Universal AI Bridge',
          version: '1.0.0',
          uptime_seconds: Math.floor(process.uptime()),
          active_connections: activeSessions.length,
          registered_projects: allProjects.length,
          port: config.port,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
};
