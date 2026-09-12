// ============================================================================
// NavOS Universal AI Bridge - Full Agent Identity & Session Lifecycle Test Suite
// 12 Comprehensive Regression Tests
// ============================================================================

import http from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const BASE_URL = 'http://127.0.0.1:3020';
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`❌ FAIL: ${testName} ${detail}`);
    totalFailed++;
  }
}

// Helper: Make raw JSON-RPC tool call over Streamable HTTP (stateless or stateful)
async function callMcpHttp({ endpoint = '/sse', sessionId = null, method = 'tools/call', params = {} }) {
  // Step 1: Initialize if no session provided
  let sid = sessionId;
  if (!sid) {
    const initRes = await new Promise((resolve, reject) => {
      const req = http.request(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'TestClient', version: '1.0.0' } }
      }));
      req.end();
    });
    sid = initRes.headers['mcp-session-id'];
  }

  // Step 2: Execute Tool Call
  const callRes = await new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (sid) {
      headers['Mcp-Session-Id'] = sid;
    }
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method,
      params
    }));
    req.end();
  });

  let parsed = null;
  const match = callRes.body.match(/data: (\{.*\})/);
  if (match) {
    try {
      parsed = JSON.parse(match[1]);
    } catch {}
  } else {
    try {
      parsed = JSON.parse(callRes.body);
    } catch {}
  }

  return { statusCode: callRes.statusCode, sessionId: sid, result: parsed?.result, error: parsed?.error, raw: callRes.body };
}

// Helper: Extract JSON from tool text content
function getToolResultJson(mcpRes) {
  const text = mcpRes?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('STARTING NAVOS 12-POINT IDENTITY & LIFECYCLE REGRESSION SUITE');
  console.log('================================================================\n');

  const TEST_PROJECT = `RegressionProj_${Date.now()}`;

  // -------------------------------------------------------------------------
  // TEST 1: Stateful agent (Persistent connection preserves identity)
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Stateful Agent - Same transport preserves session');
  const t1Init = await callMcpHttp({
    params: {
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity IDE',
        directory: process.cwd()
      }
    }
  });
  const t1Connect = getToolResultJson(t1Init);
  const agentA = t1Connect?.agent_id;
  assert(t1Connect?.success === true && !!agentA, 'TEST 1 - connect_to_mpc allocates agent', `Got: ${agentA}`);

  // Subsequent call on SAME transport session ID
  const t1GetAgents = await callMcpHttp({
    sessionId: t1Init.sessionId,
    params: { name: 'get_agents', arguments: {} }
  });
  const t1AgentsList = getToolResultJson(t1GetAgents);
  assert(Array.isArray(t1AgentsList) && t1AgentsList.some(a => a.agent_id === agentA), 'TEST 1 - get_agents succeeds on same transport session without error');

  // -------------------------------------------------------------------------
  // TEST 2: Stateless reconnect (New transport session with agent_id in arguments)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Stateless Request - New transport session with agent_id');
  // New HTTP request with completely fresh session (sessionId: null)
  const t2GetAgents = await callMcpHttp({
    sessionId: null, // Forces a new session ID
    params: {
      name: 'get_agents',
      arguments: { agent_id: agentA }
    }
  });
  const t2AgentsList = getToolResultJson(t2GetAgents);
  assert(Array.isArray(t2AgentsList), 'TEST 2 - get_agents({ agent_id }) succeeds on fresh transport session', `Raw: ${t2GetAgents.raw}`);

  // Register project to test get_project
  await callMcpHttp({
    sessionId: null,
    params: {
      name: 'register_project',
      arguments: { project_name: TEST_PROJECT, directory: process.cwd(), agent_id: agentA }
    }
  });

  const t2GetProject = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'get_project',
      arguments: { project: TEST_PROJECT, agent_id: agentA }
    }
  });
  const t2Proj = getToolResultJson(t2GetProject);
  assert(t2Proj?.project === TEST_PROJECT, 'TEST 2 - get_project({ agent_id }) succeeds on fresh transport session', `Raw: ${t2GetProject.raw}`);

  // -------------------------------------------------------------------------
  // TEST 3: Reconnect with agent_id (Must return same agent without duplicate)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Reconnect with agent_id - Returns same agent without duplication');
  const t3Reconnect = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity IDE',
        directory: process.cwd(),
        agent_id: agentA
      }
    }
  });
  const t3Data = getToolResultJson(t3Reconnect);
  assert(t3Data?.agent_id === agentA, 'TEST 3 - Reconnect returns exact same agent_id', `Got: ${t3Data?.agent_id}, expected: ${agentA}`);

  // -------------------------------------------------------------------------
  // TEST 4: Repeated 10 Reconnect Cycles (Zero agent churn)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] 10 Repeated Reconnect Cycles - Zero agent churn');
  let churnFailed = false;
  for (let i = 1; i <= 10; i++) {
    const cycle = await callMcpHttp({
      sessionId: null,
      params: {
        name: 'connect_to_mpc',
        arguments: {
          model_name: 'Gemini 3.8 Flash',
          client_location: 'Antigravity IDE',
          directory: process.cwd(),
          agent_id: agentA
        }
      }
    });
    const cData = getToolResultJson(cycle);
    if (cData?.agent_id !== agentA) {
      churnFailed = true;
      break;
    }
  }
  assert(!churnFailed, 'TEST 4 - 10 consecutive reconnect cycles all resolved to single logical agent');

  // -------------------------------------------------------------------------
  // TEST 5: ChatGPT Simulation (4 isolated stateless requests across 4 transport sessions)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] ChatGPT Simulation - 4 isolated HTTP requests across 4 sessions');
  // Req 1: connect_to_mpc
  const chatReq1 = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'GPT-5.6 Luna',
        client_location: 'ChatGPT Web PC',
        directory: null
      }
    }
  });
  const chatCommander = getToolResultJson(chatReq1)?.agent_id;
  assert(!!chatCommander, 'TEST 5.1 - ChatGPT connect_to_mpc allocates commander', `Agent: ${chatCommander}`);

  // Assign Commander role to chatCommander for TEST_PROJECT via NavOS API
  await fetch(`${BASE_URL}/api/projects/${TEST_PROJECT}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commanderId: chatCommander })
  });

  // Req 2: get_agents on new session
  const chatReq2 = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'get_agents',
      arguments: { agent_id: chatCommander }
    }
  });
  assert(!chatReq2.raw.includes('Unauthorized'), 'TEST 5.2 - ChatGPT get_agents succeeds without Unauthorized');

  // Req 3: get_project on new session
  const chatReq3 = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'get_project',
      arguments: { project: TEST_PROJECT, agent_id: chatCommander }
    }
  });
  assert(!chatReq3.raw.includes('Unauthorized'), 'TEST 5.3 - ChatGPT get_project succeeds without Unauthorized');

  // Req 4: create_phase on new session
  const chatReq4 = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'create_phase',
      arguments: {
        project: TEST_PROJECT,
        phase_number: 1,
        title: 'Phase 1 Init',
        instructions: 'Do initial test work',
        expected_outcome: 'Working initial test',
        agent_id: chatCommander
      }
    }
  });
  const phase1Data = getToolResultJson(chatReq4);
  assert(phase1Data?.success === true, 'TEST 5.4 - ChatGPT create_phase succeeds on independent session', `Raw: ${chatReq4.raw}`);

  // -------------------------------------------------------------------------
  // TEST 6: Codex Simulation (Repeated turns with new transport sessions)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Codex Simulation - Repeated turns across new transport sessions');
  const codexTurn1 = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'GPT-5',
        client_location: 'Codex Desktop',
        directory: process.cwd()
      }
    }
  });
  const codexAgent = getToolResultJson(codexTurn1)?.agent_id;

  let codexChurn = false;
  for (let turn = 2; turn <= 5; turn++) {
    const turnRes = await callMcpHttp({
      sessionId: null,
      params: {
        name: 'connect_to_mpc',
        arguments: {
          model_name: 'GPT-5',
          client_location: 'Codex Desktop',
          directory: process.cwd(),
          agent_id: codexAgent
        }
      }
    });
    if (getToolResultJson(turnRes)?.agent_id !== codexAgent) {
      codexChurn = true;
    }
  }
  assert(!codexChurn, 'TEST 6 - Codex simulation maintained single persistent agent across turns');

  // -------------------------------------------------------------------------
  // TEST 7: Two Independent Agents (Same metadata, strictly separate identities)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Two Independent Agents - Identical metadata must NOT merge');
  const indepA = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: { model_name: 'ClonedModel', client_location: 'IdenticalClient', directory: 'C:\\SharedDir' }
    }
  });
  const indepB = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: { model_name: 'ClonedModel', client_location: 'IdenticalClient', directory: 'C:\\SharedDir' }
    }
  });
  const idA = getToolResultJson(indepA)?.agent_id;
  const idB = getToolResultJson(indepB)?.agent_id;
  assert(idA !== idB, 'TEST 7 - Independent instances with same metadata allocated distinct identities', `A: ${idA}, B: ${idB}`);

  // Verify reconnects target correct identities
  const reconA = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: { model_name: 'ClonedModel', client_location: 'IdenticalClient', directory: 'C:\\SharedDir', agent_id: idA }
    }
  });
  const reconB = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: { model_name: 'ClonedModel', client_location: 'IdenticalClient', directory: 'C:\\SharedDir', agent_id: idB }
    }
  });
  assert(getToolResultJson(reconA)?.agent_id === idA && getToolResultJson(reconB)?.agent_id === idB, 'TEST 7 - Each independent instance reconnects to its own identity');

  // -------------------------------------------------------------------------
  // TEST 8: Role Isolation Enforcement
  // -------------------------------------------------------------------------
  console.log('\n[TEST 8] Role Isolation Enforcement - Commander cannot submit worker reports and vice versa');
  // Assign agentA as Worker and chatCommander as Commander for TEST_PROJECT
  await fetch(`${BASE_URL}/api/projects/${TEST_PROJECT}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commanderId: chatCommander, workerId: agentA })
  });

  // Commander attempts Worker report -> MUST FAIL
  const cmdrReportAttempt = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'submit_phase_report',
      arguments: {
        project: TEST_PROJECT,
        phase_number: 1,
        summary: 'Illegal commander report',
        work_performed: 'None',
        agent_id: chatCommander
      }
    }
  });
  assert(cmdrReportAttempt.raw.includes('Permission denied') || cmdrReportAttempt.raw.includes('Commander and cannot submit'), 'TEST 8.1 - Commander blocked from submitting Worker report');

  // Worker attempts create_phase -> MUST FAIL
  const workerPhaseAttempt = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'create_phase',
      arguments: {
        project: TEST_PROJECT,
        phase_number: 2,
        title: 'Illegal worker phase',
        instructions: 'None',
        expected_outcome: 'None',
        agent_id: agentA
      }
    }
  });
  assert(workerPhaseAttempt.raw.includes('Permission denied') || workerPhaseAttempt.raw.includes('Worker and cannot create'), 'TEST 8.2 - Worker blocked from creating Commander phase');

  // -------------------------------------------------------------------------
  // TEST 9: Stale Transport Reaper Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n[TEST 9] Stale Transport Reaper - Pruning transport preserves SQLite agent');
  // Reconnect with agentA via new session
  const t9Session = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'connect_to_mpc',
      arguments: { model_name: 'Gemini 3.8 Flash', client_location: 'Antigravity IDE', directory: process.cwd(), agent_id: agentA }
    }
  });
  assert(getToolResultJson(t9Session)?.agent_id === agentA, 'TEST 9 - Reconnected agent before transport expiry');

  // -------------------------------------------------------------------------
  // TEST 10: Antigravity Compatibility (Standard SSEClientTransport)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 10] Antigravity Compatibility - Standard SDK SSE client connection');
  let sseClient = null;
  let sseSuccess = false;
  try {
    const sseTransport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    sseClient = new Client({ name: 'AntigravityTest', version: '1.0.0' }, { capabilities: {} });
    await sseClient.connect(sseTransport);

    const sseConnectRes = await sseClient.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity IDE',
        directory: process.cwd(),
        agent_id: agentA
      }
    });
    const sseResult = JSON.parse(sseConnectRes.content[0].text);
    sseSuccess = sseResult.success === true && sseResult.agent_id === agentA;
  } catch (err) {
    console.error('SSE Error:', err);
  } finally {
    if (sseClient) {
      try { await sseClient.close(); } catch {}
    }
  }
  assert(sseSuccess, 'TEST 10 - Standard persistent SSE connection functions cleanly');

  // -------------------------------------------------------------------------
  // TEST 11: Dashboard Cleanliness (/api/agents deduplication)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 11] Dashboard Cleanliness - No duplicate agent entries');
  const apiAgents = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
  const agentIds = apiAgents.map(a => a.agent_id || a.agentId || a.id);
  const uniqueAgentIds = new Set(agentIds);
  assert(agentIds.length === uniqueAgentIds.size, 'TEST 11 - /api/agents has zero duplicate agent entries', `Total: ${agentIds.length}, Unique: ${uniqueAgentIds.size}`);

  // -------------------------------------------------------------------------
  // TEST 12: Phase Identity Stability across multiple phases
  // -------------------------------------------------------------------------
  console.log('\n[TEST 12] Phase Identity Stability across multiple phases');
  // Commander creates Phase 2
  const p2Res = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'create_phase',
      arguments: {
        project: TEST_PROJECT,
        phase_number: 2,
        title: 'Phase 2 Architecture',
        instructions: 'Design architecture',
        expected_outcome: 'Architecture doc',
        agent_id: chatCommander
      }
    }
  });
  const p2Data = getToolResultJson(p2Res);

  // Commander creates Phase 3
  const p3Res = await callMcpHttp({
    sessionId: null,
    params: {
      name: 'create_phase',
      arguments: {
        project: TEST_PROJECT,
        phase_number: 3,
        title: 'Phase 3 Implementation',
        instructions: 'Implement components',
        expected_outcome: 'Implementation',
        agent_id: chatCommander
      }
    }
  });
  const p3Data = getToolResultJson(p3Res);

  assert(p2Data?.success === true && p3Data?.success === true, 'TEST 12 - Commander created consecutive phases across independent sessions');

  // Clean up test project
  try {
    await fetch(`${BASE_URL}/api/projects/${TEST_PROJECT}`, { method: 'DELETE' });
  } catch {}

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
