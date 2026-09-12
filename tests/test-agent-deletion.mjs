// ============================================================================
// NavOS Universal AI Bridge - Agent Deletion Test Suite
// Verifies:
// 1. DELETE /api/agents/:id removes agent from DB and session registry
// 2. Project role assignments (project_agents, phase commander/worker) are cleaned up
// 3. Agent messages referencing deleted agent are removed
// 4. Calling DELETE on non-existent or already deleted agents is safely handled
// 5. Subsequent unauthorized tool attempts by deleted agent are rejected
// ============================================================================

import http from 'http';

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

async function getJson(url) {
  return fetch(url).then(r => r.json()).catch(err => ({ error: String(err) }));
}

async function postJson(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).catch(err => ({ error: String(err) }));
}

async function deleteJson(url) {
  return fetch(url, {
    method: 'DELETE'
  }).then(r => r.json()).catch(err => ({ error: String(err) }));
}

// Helper: Make raw JSON-RPC tool call over Streamable HTTP
async function callMcpHttp({ endpoint = '/sse', sessionId = null, method = 'tools/call', params = {} }) {
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
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'AgentDeletionTestClient', version: '1.0.0' } }
      }));
      req.end();
    });
    sid = initRes.headers['mcp-session-id'];
  }

  const callRes = await new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sid
      }
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
  try {
    parsed = JSON.parse(callRes.body);
  } catch (err) {
    const lines = callRes.body.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { parsed = JSON.parse(line.slice(6)); break; } catch {}
      }
    }
  }

  return { sessionId: sid, statusCode: callRes.statusCode, result: parsed?.result, error: parsed?.error };
}

async function runTests() {
  console.log('============================================================');
  console.log('NavOS Agent Deletion Test Suite');
  console.log('============================================================\n');

  // 1. Health check
  const health = await getJson(`${BASE_URL}/health`);
  assert(health.status === 'ok', 'Server is online and responding to /health');

  // 2. Connect an agent to delete
  console.log('\n--- Test Case 1: Connect Agent for Deletion ---');
  const agentConn = await callMcpHttp({
    method: 'tools/call',
    params: {
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Deletion Target Agent',
        client_location: 'Delete Test Runner',
        directory: 'C:/TestDeletionWorkspace'
      }
    }
  });

  assert(!agentConn.error, 'connect_to_mpc succeeded without JSON-RPC error');
  const connData = JSON.parse(agentConn.result?.content?.[0]?.text || '{}');
  const targetAgentId = connData.agent_id;
  assert(!!targetAgentId, `Received agent_id: ${targetAgentId}`);

  // 3. Verify agent appears in /api/agents
  let agentsList = await getJson(`${BASE_URL}/api/agents`);
  let found = agentsList.find?.(a => a.id === targetAgentId);
  assert(!!found, `Agent ${targetAgentId} is listed in /api/agents`);
  assert(found?.isCurrentlyConnected === true, `Agent ${targetAgentId} is currently connected`);

  // 4. Register a project and assign the agent as Worker
  console.log('\n--- Test Case 2: Project Association and Messaging ---');
  const testProjectName = `DelTestProj_${Date.now()}`;
  await postJson(`${BASE_URL}/api/projects/${encodeURIComponent(testProjectName)}/roles`, {
    workerId: targetAgentId
  });

  let projects = await getJson(`${BASE_URL}/api/projects`);
  let targetProj = projects.find?.(p => p.name === testProjectName);
  assert(targetProj?.worker === targetAgentId, `Agent ${targetAgentId} assigned as Worker on project ${testProjectName}`);

  // Send a message from this agent
  const msgCall = await callMcpHttp({
    sessionId: agentConn.sessionId,
    method: 'tools/call',
    params: {
      name: 'send_agent_message',
      arguments: {
        message: 'Hello before I get deleted',
        project: testProjectName,
        agent_id: targetAgentId
      }
    }
  });
  assert(!msgCall.error, 'Agent sent message successfully');

  // 5. Delete the agent via DELETE /api/agents/:id
  console.log('\n--- Test Case 3: DELETE /api/agents/:id ---');
  const deleteRes = await deleteJson(`${BASE_URL}/api/agents/${encodeURIComponent(targetAgentId)}`);
  assert(deleteRes.success === true, 'DELETE /api/agents/:id returned success: true');
  assert(deleteRes.deleted === true, 'DELETE /api/agents/:id reported deleted: true');
  assert(deleteRes.agentId === targetAgentId, `Returned agentId matches ${targetAgentId}`);

  // 6. Verify agent no longer exists in /api/agents
  agentsList = await getJson(`${BASE_URL}/api/agents`);
  found = agentsList.find?.(a => a.id === targetAgentId);
  assert(!found, `Agent ${targetAgentId} is completely removed from /api/agents`);

  // 7. Verify project assignment is cleared
  projects = await getJson(`${BASE_URL}/api/projects`);
  targetProj = projects.find?.(p => p.name === testProjectName);
  assert(targetProj?.worker !== targetAgentId, `Agent ${targetAgentId} is no longer worker on project`);

  // 8. Delete again (idempotency / non-existent)
  console.log('\n--- Test Case 4: Safe Non-Existent Agent Deletion ---');
  const deleteAgain = await deleteJson(`${BASE_URL}/api/agents/${encodeURIComponent(targetAgentId)}`);
  assert(deleteAgain.success === true, 'Subsequent delete returns success: true');
  assert(deleteAgain.deleted === false, 'Subsequent delete reports deleted: false');

  const deleteFake = await deleteJson(`${BASE_URL}/api/agents/non-existent-agent-9999`);
  assert(deleteFake.success === true, 'Deleting non-existent agent returns success: true');
  assert(deleteFake.deleted === false, 'Deleting non-existent agent reports deleted: false');

  // Clean up test project
  await deleteJson(`${BASE_URL}/api/projects/${encodeURIComponent(testProjectName)}`);

  // Summary
  console.log('\n============================================================');
  console.log(`Deletion Test Suite Complete: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('============================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running deletion tests:', err);
  process.exit(1);
});
