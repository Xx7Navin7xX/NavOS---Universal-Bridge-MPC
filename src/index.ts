import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { config, syncConfigProjectsToDb } from './config.js';
import { sessionRegistry } from './sessions.js';
import {
  getAllAgents,
  getAgent,
  getAllProjects,
  registerProject,
  getProject,
  deleteProject,
  setProjectAgentRole,
  getProjectAgents,
  getCurrentPhase,
  getProjectPhases,
  getPhaseReports,
  getPendingHumanInput,
  answerHumanInput,
  setPhaseStatus,
  getActivityLog,
  logActivity
} from './db.js';
import { waitForPhaseEvent } from './tools/orchestration.js';
import { AgentRole } from './types.js';

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files for the Web Dashboard
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// ---------------------------------------------------------------------------
// Health & Diagnostic API
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  const activeSessions = sessionRegistry.getAllActiveSessions();
  res.json({
    status: 'online',
    port: config.port,
    uptimeSeconds: Math.floor(process.uptime()),
    database: 'healthy',
    activeConnections: activeSessions.length,
    registeredAgents: activeSessions.length,
    projects: getAllProjects().length
  });
});

// ---------------------------------------------------------------------------
// Dashboard REST APIs
// ---------------------------------------------------------------------------

function getEnrichedAgents() {
  const activeSessions = sessionRegistry.getAllActiveSessions();
  const sessionMap = new Map(activeSessions.map(s => [s.agentId, s]));

  // Connected Agents list: ONLY explicitly connected agents with an active session
  return activeSessions.map(session => {
    const dbAgent = session.agentId ? getAgent(session.agentId) : null;
    return {
      id: session.agentId,
      agentId: session.agentId,
      modelName: session.modelName || dbAgent?.model_name || 'AI Model',
      clientLocation: session.clientLocation || dbAgent?.client_location || session.clientName,
      client: session.clientLocation || session.clientName,
      clientName: session.clientLocation || session.clientName,
      agentType: session.agentType || dbAgent?.agent_type || (session.directory ? 'NATIVE' : 'WEB'),
      directory: session.directory || dbAgent?.directory || null,
      provider: session.provider || dbAgent?.provider || 'AI',
      role: session.role || dbAgent?.role || 'Unassigned',
      project: session.activeProject || dbAgent?.current_project || null,
      isCurrentlyConnected: true,
      activeSessionId: session.sessionId,
      connectedAt: session.connectedAt
    };
  });
}

function getEnrichedProjects() {
  const projects = getAllProjects();
  return projects.map(p => {
    const projectAgents = getProjectAgents(p.name);
    const commanderAgent = projectAgents.find(a => a.role === 'Commander')?.agent_id || null;
    const workerAgent = projectAgents.find(a => a.role === 'Worker')?.agent_id || null;
    const currentPhase = getCurrentPhase(p.name);
    const phases = getProjectPhases(p.name);
    const pendingInput = getPendingHumanInput(p.name);

    let workflowState = 'idle';
    let workflowStateLabel = 'Idle';
    if (pendingInput || currentPhase?.status === 'waiting_human_input') {
      workflowState = 'waiting_human_input';
      workflowStateLabel = 'Waiting for human input';
    } else if (currentPhase) {
      if (currentPhase.status === 'active') {
        workflowState = 'worker_active';
        workflowStateLabel = 'Worker active';
      } else if (currentPhase.status === 'under_review') {
        workflowState = 'under_review';
        workflowStateLabel = 'Under review';
      } else if (currentPhase.status === 'completed') {
        workflowState = 'completed';
        workflowStateLabel = 'Completed';
      }
    }

    return {
      ...p,
      directory: p.directory || p.workspace_info || null,
      commander: commanderAgent,
      worker: workerAgent,
      currentPhase,
      totalPhases: phases.length,
      pendingInput,
      workflowState,
      workflowStateLabel
    };
  });
}

app.get('/api/agents', (req, res) => {
  res.json(getEnrichedAgents());
});

app.get('/api/projects', (req, res) => {
  res.json(getEnrichedProjects());
});

app.delete('/api/projects/:name', (req, res) => {
  const name = req.params.name as string;
  if (!name) {
    res.status(400).json({ error: 'Missing project name.' });
    return;
  }
  const deleted = deleteProject(name);
  if (config.projects[name]) {
    delete config.projects[name];
  }
  logActivity('project_deleted', `Deleted project '${name}'`, null, { project: name });
  sessionRegistry.broadcast('project_deleted', { project: name });
  res.json({ success: true, project: name, deleted });
});

// Role assignment: WEB agents can NEVER be Worker. Worker is NATIVE only.
app.post(['/api/projects/:name/roles', '/api/projects/:name/assign'], (req, res) => {
  const name = req.params.name as string;
  const { commanderId, workerId, agentId, role } = req.body;
  registerProject(name);

  // Validate Worker eligibility: NATIVE agents only
  const targetWorker = workerId || (role === 'Worker' ? agentId : null);
  if (targetWorker) {
    const dbWorker = getAgent(targetWorker);
    if (!dbWorker) {
      res.status(404).json({ error: `Agent '${targetWorker}' not found.` });
      return;
    }
    if (dbWorker.agent_type === 'WEB' || (!dbWorker.directory && dbWorker.agent_type !== 'NATIVE')) {
      res.status(400).json({
        error: `Invalid assignment: WEB agents cannot be assigned the Worker role. Only NATIVE agents with a local workspace directory are eligible as Workers.`
      });
      return;
    }
  }

  if (commanderId !== undefined && commanderId) {
    const dbCmd = getAgent(commanderId);
    if (!dbCmd) {
      res.status(404).json({ error: `Agent '${commanderId}' not found.` });
      return;
    }
    setProjectAgentRole(name, commanderId, 'Commander');
    sessionRegistry.updateAgentProjectRole(commanderId, name, 'Commander');
    logActivity('role_assigned', `Assigned Commander '${commanderId}' to project '${name}'`, commanderId, { project: name, role: 'Commander' });
  }

  if (workerId !== undefined && workerId) {
    setProjectAgentRole(name, workerId, 'Worker');
    sessionRegistry.updateAgentProjectRole(workerId, name, 'Worker');
    logActivity('role_assigned', `Assigned Worker '${workerId}' to project '${name}'`, workerId, { project: name, role: 'Worker' });
  }

  if (agentId && role) {
    setProjectAgentRole(name, agentId, role as AgentRole);
    sessionRegistry.updateAgentProjectRole(agentId, name, role as AgentRole);
    logActivity('role_assigned', `Assigned '${role}' to agent '${agentId}' for project '${name}'`, agentId, { project: name, role });
  }

  sessionRegistry.broadcast('project_updated', { project: name });
  res.json({ success: true, project: name, commanderId, workerId, agentId, role });
});

// Reactive Wake-Up HTTP Endpoint for Background Tasks
app.get('/api/projects/:name/wait-phase', async (req, res) => {
  const projectName = req.params.name;
  const afterPhase = parseInt((req.query.afterPhase as string) || '0', 10);
  const timeoutSeconds = Math.min(parseInt((req.query.timeout as string) || '300', 10), 600);

  const result = await waitForPhaseEvent(projectName, afterPhase, timeoutSeconds * 1000);
  if (result.status === 'timeout') {
    res.status(200).json({ status: 'timeout', project: projectName, afterPhase });
  } else {
    res.status(200).json({ status: 'ready', project: projectName, phase: result.phase });
  }
});

app.post('/api/projects/:name/human-input', (req, res) => {
  const name = req.params.name;
  const { inputId, response } = req.body;
  if (!response) {
    res.status(400).json({ error: 'Missing response.' });
    return;
  }

  if (inputId) {
    answerHumanInput(inputId, response);
  }

  // Clear waiting_human_input status on current phase
  const currentPhase = getCurrentPhase(name);
  if (currentPhase && currentPhase.status === 'waiting_human_input') {
    setPhaseStatus(currentPhase.id, 'active');
  }

  logActivity('human_input_answered', `Human provided input for project '${name}': "${response.slice(0, 80)}"`, null, {
    project: name,
    response
  });

  sessionRegistry.broadcast('human_input_answered', { project: name, response });
  sessionRegistry.broadcast('project_updated', { project: name });
  res.json({ success: true, project: name, response });
});

app.get('/api/projects/:name/phases', (req, res) => {
  const name = req.params.name;
  const phases = getProjectPhases(name);
  const reports = getPhaseReports(name);
  const pendingInput = getPendingHumanInput(name);
  res.json({ phases, reports, pendingInput });
});

app.get('/api/activity', (req, res) => {
  const limit = parseInt((req.query.limit as string) || '50', 10);
  res.json(getActivityLog(limit));
});

// ---------------------------------------------------------------------------
// Dashboard SSE Stream for Real-time Updates
// ---------------------------------------------------------------------------

app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  sessionRegistry.addDashboardClient(res);

  const initialData = {
    agents: getEnrichedAgents(),
    projects: getEnrichedProjects(),
    activity: getActivityLog(25)
  };
  res.write(`event: snapshot\ndata: ${JSON.stringify(initialData)}\n\n`);

  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAliveInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    sessionRegistry.removeDashboardClient(res);
  });
});

// ---------------------------------------------------------------------------
// MCP Protocol Transport (Unified Streamable HTTP & Legacy SSE)
// ---------------------------------------------------------------------------

async function handleMcpTransport(req: express.Request, res: express.Response) {
  const sessionIdHeader = (req.headers['mcp-session-id'] as string) || (req.query.sessionId as string) || null;

  if (req.method === 'POST') {
    if (sessionIdHeader) {
      let session = sessionRegistry.getSessionByTransportId(sessionIdHeader);
      if (!session) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionIdHeader
        });
        session = sessionRegistry.registerSession(sessionIdHeader, transport, null, req.headers, req.query as Record<string, any>);
        const { server } = createMcpServer(sessionIdHeader, session);
        await server.connect(transport);
        transport.onclose = () => {
          sessionRegistry.unregisterSession(sessionIdHeader);
        };
      }
      sessionRegistry.touchSession(sessionIdHeader);

      const clientInfo = req.body?.params?.clientInfo || req.body?.params?._meta?.['io.modelcontextprotocol/clientInfo'];
      if (clientInfo?.name) {
        sessionRegistry.updateClientInfo(sessionIdHeader, clientInfo.name, clientInfo.version || '1.0.0');
      }

      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New Streamable HTTP initialization request
    const newSessionId = uuidv4();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId
    });

    const activeSession = sessionRegistry.registerSession(newSessionId, transport, null, req.headers, req.query as Record<string, any>);
    const { server } = createMcpServer(newSessionId, activeSession);
    await server.connect(transport);

    const clientInfo = req.body?.params?.clientInfo || req.body?.params?._meta?.['io.modelcontextprotocol/clientInfo'];
    if (clientInfo?.name) {
      sessionRegistry.updateClientInfo(newSessionId, clientInfo.name, clientInfo.version || '1.0.0');
    }

    transport.onclose = () => {
      sessionRegistry.unregisterSession(newSessionId);
    };

    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === 'GET') {
    if (sessionIdHeader) {
      let session = sessionRegistry.getSessionByTransportId(sessionIdHeader);
      if (!session) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionIdHeader
        });
        session = sessionRegistry.registerSession(sessionIdHeader, transport, null, req.headers, req.query as Record<string, any>);
        const { server } = createMcpServer(sessionIdHeader, session);
        await server.connect(transport);
        transport.onclose = () => {
          sessionRegistry.unregisterSession(sessionIdHeader);
        };
      }
      sessionRegistry.touchSession(sessionIdHeader);
      await session.transport.handleRequest(req, res);
      return;
    }

    // Legacy SSE connection
    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    res.setHeader('Mcp-Session-Id', sessionId);

    const activeSession = sessionRegistry.registerSession(sessionId, transport, null, req.headers, req.query as Record<string, any>);
    const { server } = createMcpServer(sessionId, activeSession);
    await server.connect(transport);

    res.on('close', () => {
      sessionRegistry.unregisterSession(sessionId);
    });
    return;
  }

  if (req.method === 'DELETE') {
    if (sessionIdHeader) {
      const session = sessionRegistry.getSessionByTransportId(sessionIdHeader);
      if (session && session.transport && typeof session.transport.handleRequest === 'function') {
        await session.transport.handleRequest(req, res);
      }
      sessionRegistry.unregisterSession(sessionIdHeader);
      if (!res.headersSent) {
        res.status(200).send('OK');
      }
      return;
    }
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
    return;
  }

  res.status(405).send('Method Not Allowed');
}

app.all(['/sse', '/mcp'], handleMcpTransport);

app.post('/message', async (req, res) => {
  const sessionId = (req.query.sessionId as string) || (req.headers['mcp-session-id'] as string);
  if (!sessionId) {
    res.status(400).send('Missing sessionId parameter.');
    return;
  }

  const session = sessionRegistry.getSessionByTransportId(sessionId);
  if (!session) {
    res.status(404).send('Session not found or expired.');
    return;
  }

  try {
    sessionRegistry.touchSession(sessionId);
    if (typeof session.transport.handlePostMessage === 'function') {
      await session.transport.handlePostMessage(req, res, req.body);
    } else if (typeof session.transport.handleRequest === 'function') {
      await session.transport.handleRequest(req, res, req.body);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to handle POST /message for session ${sessionId}:`, err);
    res.status(500).send('Internal transport error.');
  }
});

// Fallback Route for Single Page Application
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/sse' || req.path === '/mcp' || req.path === '/message') {
    return next();
  }
  const indexPath = path.resolve(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('Universal AI Bridge running. Dashboard loading...');
  }
});

// Server Initialization
const PORT = config.port;

// Sync projects from config.json into SQLite on startup
syncConfigProjectsToDb();

const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`  Universal AI Collaboration Bridge - Redesigned MCP Server`);
  console.log(`  Web Dashboard: http://127.0.0.1:${PORT}/`);
  console.log(`  MCP SSE / HTTP: http://127.0.0.1:${PORT}/sse`);
  console.log('================================================================');
});

// Ensure event loop remains active in headless daemon runners
setInterval(() => {}, 1000 * 60 * 60);

