import { identityTools } from './identity.js';
import { orchestrationTools } from './orchestration.js';
import { gitTools } from './git.js';
import { getServerStatusTool } from './server.js';
import { McpTool } from '../types.js';

export const allTools: McpTool[] = [
  ...identityTools,
  ...orchestrationTools,
  ...gitTools,
  getServerStatusTool
];
