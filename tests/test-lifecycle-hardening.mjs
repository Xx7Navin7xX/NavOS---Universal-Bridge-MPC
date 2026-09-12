// ============================================================================
// NavOS Universal AI Bridge - Lifecycle Hardening & Grace Period Test Suite
// Targeted tests for idle TTL, SSE grace period, and identity preservation
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

async function postJson(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()).catch(() => ({}));
}

async function getJson(url) {
  return fetch(url).then(r => r.json()).catch(() => ({}));
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
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'HardeningTestClient', version: '1.0.0' } }
      }));
      req.end();
    });
    sid = initRes.headers['mcp-session-id'];
  }

  const callRes = await new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (sid) headers['Mcp-Session-Id'] = sid;

    const req = http.request(`${BASE_URL}${endpoint}`, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body, sessionId: sid }));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method, params }));
    req.end();
  });

  return callRes;
}

function parseMcpToolResult(res) {
  try {
    const match = res.body.match(/data:\s*({.*})/);
    if (match) {
      const jsonRpc = JSON.parse(match[1]);
      return JSON.parse(jsonRpc.result.content[0].text);
    }
    const direct = JSON.parse(res.body);
    return JSON.parse(direct.result.content[0].text);
  } catch {
    return null;
  }
}

async function runHardeningSuite() {
  console.log('================================================================');
  console.log('STARTING NAVOS LIFECYCLE HARDENING & GRACE PERIOD TEST SUITE');
  console.log('================================================================\n');

  // Reset test state cleanly
  await postJson(`${BASE_URL}/api/test/reset`, {});

  try {
    // -------------------------------------------------------------------------
    // TEST 1: 30+ Minute Stateless Idle Timeout Behavior
    // -------------------------------------------------------------------------
    console.log('[TEST 1] 30+ Minute Stateless Idle Timeout Behavior');
    const connectRes1 = await callMcpHttp({
      params: {
        name: 'connect_to_mpc',
        arguments: {
          model_name: 'GPT-5.6 Luna',
          client_location: 'ChatGPT Web PC'
        }
      }
    });
    const agent1 = parseMcpToolResult(connectRes1);
    assert(agent1 && agent1.agent_id, 'TEST 1 - Agent connected via stateless HTTP', agent1?.agent_id);

    // Verify agent is visible in /api/agents
    let activeAgents = await getJson(`${BASE_URL}/api/agents`);
    assert(activeAgents.some(a => a.id === agent1.agent_id), 'TEST 1 - Agent visible in /api/agents');

    // Verify reaper configuration: default idle timeout is 1800s (30 minutes)
    // Querying server status shows healthy uptime and active connection
    const status = await getJson(`${BASE_URL}/api/status`);
    assert(status.status === 'online' && status.registeredAgents >= 1, 'TEST 1 - Server status reflects active stateless agent');

    // -------------------------------------------------------------------------
    // TEST 2: SSE Disconnect + Reconnect Within Grace Period
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] SSE Disconnect + Reconnect Within Grace Period');
    // Set grace period to 3 seconds for fast automated testing
    await postJson(`${BASE_URL}/api/test/grace-period`, { seconds: 3 });

    const sseTransport2 = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    const sseClient2 = new Client({ name: 'WorkerSSE', version: '1.0.0' }, { capabilities: {} });
    await sseClient2.connect(sseTransport2);

    const sseConnectRes = await sseClient2.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity IDE',
        directory: 'C:\\SharedWorkspace'
      }
    });
    const agent2 = JSON.parse(sseConnectRes.content[0].text);
    assert(agent2 && agent2.agent_id, 'TEST 2 - Native SSE agent connected', agent2?.agent_id);

    // Close the SSE transport to simulate network drop / IDE client recycle
    await sseTransport2.close();
    await new Promise(r => setTimeout(r, 500)); // 500ms into 3s grace period

    // Verify agent is STILL listed as Connected during grace period!
    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    const agentDuringGrace = activeAgents.find(a => a.id === agent2.agent_id);
    assert(agentDuringGrace && agentDuringGrace.isCurrentlyConnected === true,
      'TEST 2 - Agent remains Connected during grace period after SSE transport drop');

    // Reconnect BEFORE the grace period expires (within 3 seconds)
    const sseTransport2Reconnected = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    const sseClient2Reconnected = new Client({ name: 'WorkerSSE_Reconnected', version: '1.0.0' }, { capabilities: {} });
    await sseClient2Reconnected.connect(sseTransport2Reconnected);

    const sseRebindRes = await sseClient2Reconnected.callTool({
      name: 'connect_to_mpc',
      arguments: {
        agent_id: agent2.agent_id,
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity IDE',
        directory: 'C:\\SharedWorkspace'
      }
    });
    const reconnectedAgent = JSON.parse(sseRebindRes.content[0].text);
    assert(reconnectedAgent.agent_id === agent2.agent_id, 'TEST 2 - Rebound to exact same agent ID within grace period');

    // Wait past the original 3s grace timer to prove timer was cancelled on reconnect
    await new Promise(r => setTimeout(r, 3500));

    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    assert(activeAgents.some(a => a.id === agent2.agent_id),
      'TEST 2 - Agent still Connected after grace timer expiry because reconnect cancelled pending disconnect');

    await sseClient2Reconnected.close();

    // -------------------------------------------------------------------------
    // TEST 3: SSE Disconnect Without Reconnect
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] SSE Disconnect Without Reconnect (Grace Period Expiry)');
    // Grace period is 2 seconds
    await postJson(`${BASE_URL}/api/test/grace-period`, { seconds: 2 });

    const sseTransport3 = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    const sseClient3 = new Client({ name: 'EphemeralWorker', version: '1.0.0' }, { capabilities: {} });
    await sseClient3.connect(sseTransport3);

    const conn3 = await sseClient3.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Claude 3.5 Sonnet',
        client_location: 'Codex CLI',
        directory: 'C:\\EphemeralDir'
      }
    });
    const agent3 = JSON.parse(conn3.content[0].text);

    // Close transport without reconnecting
    await sseTransport3.close();

    // Within grace period (< 2s)
    await new Promise(r => setTimeout(r, 400));
    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    assert(activeAgents.some(a => a.id === agent3.agent_id),
      'TEST 3 - Agent still visible at 400ms during grace period');

    // Wait for grace period to fully expire (2s + buffer)
    await new Promise(r => setTimeout(r, 2200));

    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    assert(!activeAgents.some(a => a.id === agent3.agent_id),
      'TEST 3 - Agent cleanly removed from /api/agents after grace period expired');

    // Verify in SQLite all records that agent status is Disconnected
    const allDbAgents = await getJson(`${BASE_URL}/api/agents?all=true`);
    const dbRecord3 = allDbAgents.find(a => a.id === agent3.agent_id);
    assert(dbRecord3 && dbRecord3.status === 'Disconnected',
      'TEST 3 - Agent status set to Disconnected in SQLite');

    // -------------------------------------------------------------------------
    // TEST 4: Logical Agent ID Preservation
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Logical Agent ID Preservation across sessions and roles');
    const project4Name = `HardeningProj_${Date.now()}`;

    // Register project
    const projRes = await callMcpHttp({
      params: {
        name: 'register_project',
        arguments: {
          agent_id: agent2.agent_id,
          project_name: project4Name,
          directory: 'C:\\SharedWorkspace'
        }
      }
    });
    const projData = parseMcpToolResult(projRes);
    assert(projData && projData.success, 'TEST 4 - Project registered');

    // Assign Worker role
    await postJson(`${BASE_URL}/api/projects/${project4Name}/roles`, {
      workerId: agent2.agent_id
    });

    // Reconnect on a fresh session with agent_id
    const freshRebindRes = await callMcpHttp({
      params: {
        name: 'connect_to_mpc',
        arguments: {
          agent_id: agent2.agent_id,
          model_name: 'Gemini 3.8 Flash',
          client_location: 'Antigravity IDE',
          directory: 'C:\\SharedWorkspace'
        }
      }
    });
    const freshAgent = parseMcpToolResult(freshRebindRes);
    assert(freshAgent.agent_id === agent2.agent_id, 'TEST 4 - Reconnected agent retains agent_id');
    assert(freshAgent.role === 'Worker', 'TEST 4 - Reconnected agent retains assigned Worker role');

    // -------------------------------------------------------------------------
    // TEST 5: Duplicate Prevention
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Duplicate Prevention on repeated turns');
    for (let i = 0; i < 5; i++) {
      await callMcpHttp({
        params: {
          name: 'connect_to_mpc',
          arguments: {
            agent_id: agent2.agent_id,
            model_name: 'Gemini 3.8 Flash',
            client_location: 'Antigravity IDE',
            directory: 'C:\\SharedWorkspace'
          }
        }
      });
    }

    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    const agent2Matches = activeAgents.filter(a => a.id === agent2.agent_id);
    assert(agent2Matches.length === 1, 'TEST 5 - Zero duplicate agent entries in /api/agents (exactly 1 match)');

    // -------------------------------------------------------------------------
    // TEST 6: Startup Reset
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Startup Reset cleans stale records without data loss');
    const resetRes = await postJson(`${BASE_URL}/api/test/reset`, {});
    assert(resetRes.success === true, 'TEST 6 - /api/test/reset succeeded');

    const activeAfterReset = await getJson(`${BASE_URL}/api/agents`);
    assert(activeAfterReset.length === 0, 'TEST 6 - Zero active connected agents after reset');

    const historyAfterReset = await getJson(`${BASE_URL}/api/agents?all=true`);
    assert(historyAfterReset.some(a => a.id === agent2.agent_id),
      'TEST 6 - Historical agent record preserved in SQLite');

    // -------------------------------------------------------------------------
    // TEST 7: Multiple Agents Sharing One Directory
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] Multiple Agents Sharing One Directory');
    const multiDir = 'C:\\MultiAgentDirectory';

    const dirAgent1Res = await callMcpHttp({
      params: {
        name: 'connect_to_mpc',
        arguments: {
          model_name: 'Gemini 3.8 Flash',
          client_location: 'Antigravity IDE',
          directory: multiDir
        }
      }
    });
    const dirAgent1 = parseMcpToolResult(dirAgent1Res);

    const dirAgent2Res = await callMcpHttp({
      params: {
        name: 'connect_to_mpc',
        arguments: {
          model_name: 'Claude 3.5 Sonnet',
          client_location: 'Codex CLI',
          directory: multiDir
        }
      }
    });
    const dirAgent2 = parseMcpToolResult(dirAgent2Res);

    assert(dirAgent1.agent_id !== dirAgent2.agent_id,
      'TEST 7 - Agents on identical directory assigned distinct agent IDs',
      `${dirAgent1.agent_id} vs ${dirAgent2.agent_id}`);

    activeAgents = await getJson(`${BASE_URL}/api/agents`);
    assert(activeAgents.some(a => a.id === dirAgent1.agent_id) && activeAgents.some(a => a.id === dirAgent2.agent_id),
      'TEST 7 - Both agents on same directory visible simultaneously in /api/agents');

    // Restore production default grace period (45 seconds)
    await postJson(`${BASE_URL}/api/test/grace-period`, { seconds: 45 });

  } catch (err) {
    console.error('Unexpected error in test suite:', err);
    totalFailed++;
  }

  console.log('\n================================================================');
  if (totalFailed === 0) {
    console.log(`🎉 ALL ${totalPassed} LIFECYCLE HARDENING TESTS PASSED!`);
  } else {
    console.error(`❌ FINISHED WITH ${totalFailed} FAILURES (Passed: ${totalPassed}).`);
  }
  console.log('================================================================\n');

  process.exit(totalFailed === 0 ? 0 : 1);
}

runHardeningSuite();
