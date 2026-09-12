// ============================================================================
// NavOS - AI Bridge: Prototype 1 Comprehensive End-to-End Orchestration Suite
// ============================================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const BASE_URL = 'http://127.0.0.1:3020';

async function runTests() {
  console.log('================================================================');
  console.log('STARTING NAVOS PROTOTYPE 1 ARCHITECTURE & ORCHESTRATION TESTS');
  console.log('================================================================\n');

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  }

  let clientCommander = null;
  let clientWorker = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Health & Server Status
    // -------------------------------------------------------------------------
    console.log('[STEP 1] Testing /health and /api/status...');
    const health = await fetch(`${BASE_URL}/health`).then(r => r.json());
    assert(health.status === 'ok', '/health returned status: ok');

    const status = await fetch(`${BASE_URL}/api/status`).then(r => r.json());
    assert(status.status === 'online', '/api/status reports server is online');
    assert(status.database === 'healthy', '/api/status reports SQLite is healthy');

    // -------------------------------------------------------------------------
    // 2. Connect Commander (ChatGPT / OpenAI) & Worker (Antigravity IDE / Gemini)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 2] Connecting Commander (ChatGPT) and Worker (Antigravity IDE)...');
    
    // Connect Commander
    const transportCommander = new SSEClientTransport(new URL(`${BASE_URL}/sse?agent=ChatGPT`));
    clientCommander = new Client({
      name: 'ChatGPT',
      version: '4.0.0'
    }, { capabilities: {} });
    await clientCommander.connect(transportCommander);
    logPass('Commander connected via SSE (ChatGPT)');

    // Connect Worker
    const transportWorker = new SSEClientTransport(new URL(`${BASE_URL}/sse?agent=Antigravity-IDE&client=ide`));
    clientWorker = new Client({
      name: 'Antigravity IDE',
      version: '1.2.0'
    }, { capabilities: {} });
    await clientWorker.connect(transportWorker);
    logPass('Worker connected via SSE (Antigravity IDE)');

    // Allow registration to settle
    await new Promise(r => setTimeout(r, 250));

    // -------------------------------------------------------------------------
    // 3. Verify Exact Core Toolset (10 Tools, Workspace Tools Removed)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 3] Verifying MCP Toolset has exactly the 10 core orchestration tools...');
    const toolsList = await clientCommander.listTools();
    const toolNames = toolsList.tools.map(t => t.name).sort();
    const expectedTools = [
      'advance_phase',
      'create_phase',
      'get_agents',
      'get_current_phase',
      'get_my_identity',
      'get_projects',
      'register_agent',
      'register_project',
      'request_human_input',
      'submit_phase_report'
    ].sort();

    assert(toolNames.length === 10, `Tool surface has exactly 10 tools (found ${toolNames.length})`);
    assert(JSON.stringify(toolNames) === JSON.stringify(expectedTools), 'Tool list matches exactly the 10 required orchestration tools');

    // Ensure removed filesystem and kanban tools are not present
    const removedTools = ['list_files', 'read_file', 'write_file', 'apply_patch', 'run_command', 'create_project', 'delete_project', 'select_project', 'set_project', 'assign_task', 'claim_task'];
    const foundRemoved = toolNames.filter(t => removedTools.includes(t));
    assert(foundRemoved.length === 0, `Removed tools correctly absent (found: ${foundRemoved.join(', ') || 'none'})`);

    // -------------------------------------------------------------------------
    // 4. Test get_my_identity & Client Detection
    // -------------------------------------------------------------------------
    console.log('\n[STEP 4] Testing get_my_identity and Client/Provider identification...');
    const idResCommander = await clientCommander.callTool({ name: 'get_my_identity', arguments: {} });
    const idCommander = JSON.parse(idResCommander.content[0].text);
    assert(idCommander.agentId === 'ChatGPT', 'Commander agentId is ChatGPT');
    assert(idCommander.provider === 'OpenAI', 'Commander provider identified as OpenAI');
    assert(idCommander.client === 'ChatGPT', 'Commander client identified as ChatGPT');

    const idResWorker = await clientWorker.callTool({ name: 'get_my_identity', arguments: {} });
    const idWorker = JSON.parse(idResWorker.content[0].text);
    assert(idWorker.agentId === 'Antigravity-IDE', 'Worker agentId is Antigravity-IDE');
    assert(idWorker.provider === 'Google Gemini', 'Worker provider identified as Google Gemini');
    assert(idWorker.client === 'Antigravity IDE', 'Worker client identified as Antigravity IDE');

    // -------------------------------------------------------------------------
    // 5. Test register_project MCP Tool
    // -------------------------------------------------------------------------
    console.log('\n[STEP 5] Testing register_project MCP tool...');
    const regProjRes = await clientCommander.callTool({
      name: 'register_project',
      arguments: {
        name: 'NavOS AI Bridge',
        description: 'Orchestration and communication layer between Commander and Worker agents',
        workspaceInfo: 'C:\\Projects\\NavOS'
      }
    });
    assert(!regProjRes.isError, 'register_project succeeded without creating or modifying filesystem');

    const getProjectsRes = await clientWorker.callTool({ name: 'get_projects', arguments: {} });
    const projectsList = JSON.parse(getProjectsRes.content[0].text);
    const navosProj = projectsList.find(p => p.name === 'NavOS AI Bridge');
    assert(navosProj !== undefined, 'NavOS AI Bridge found in get_projects');

    // -------------------------------------------------------------------------
    // 6. Project Role Assignment
    // -------------------------------------------------------------------------
    console.log('\n[STEP 6] Assigning Commander and Worker roles to NavOS AI Bridge...');
    const assignRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent('NavOS AI Bridge')}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commanderId: 'ChatGPT',
        workerId: 'Antigravity-IDE'
      })
    }).then(r => r.json());
    assert(assignRes.success === true, 'Assigned Commander and Worker via /api/projects/:name/roles');

    // Verify /api/projects enriched output
    const enrichedProjects = await fetch(`${BASE_URL}/api/projects`).then(r => r.json());
    const enrichedNavos = enrichedProjects.find(p => p.name === 'NavOS AI Bridge');
    assert(enrichedNavos.commander === 'ChatGPT', 'Project commander set to ChatGPT');
    assert(enrichedNavos.worker === 'Antigravity-IDE', 'Project worker set to Antigravity-IDE');

    // -------------------------------------------------------------------------
    // 7. Role Security & Authorization Verification
    // -------------------------------------------------------------------------
    console.log('\n[STEP 7] Testing Role Security: Unauthorized Worker attempts to create phase...');
    const unauthorizedCreate = await clientWorker.callTool({
      name: 'create_phase',
      arguments: {
        project: 'NavOS AI Bridge',
        phaseNumber: 1,
        title: 'Unauthorized Phase',
        objective: 'Worker trying to create phase',
        instructions: 'Should fail'
      }
    });
    assert(unauthorizedCreate.isError === true, 'Worker create_phase was rejected with isError: true');
    assert(unauthorizedCreate.content[0].text.includes('Permission denied'), 'Rejection cites Permission denied');

    const unauthorizedAdvance = await clientWorker.callTool({
      name: 'advance_phase',
      arguments: {
        project: 'NavOS AI Bridge',
        completedPhaseNumber: 1
      }
    });
    assert(unauthorizedAdvance.isError === true, 'Worker advance_phase was rejected with isError: true');

    const unauthorizedHumanInput = await clientWorker.callTool({
      name: 'request_human_input',
      arguments: {
        project: 'NavOS AI Bridge',
        phaseNumber: 1,
        question: 'Should fail'
      }
    });
    assert(unauthorizedHumanInput.isError === true, 'Worker request_human_input was rejected with isError: true');

    // -------------------------------------------------------------------------
    // 8. Commander Creates Phase 1
    // -------------------------------------------------------------------------
    console.log('\n[STEP 8] Commander creates Phase 1...');
    const createPhaseRes = await clientCommander.callTool({
      name: 'create_phase',
      arguments: {
        project: 'NavOS AI Bridge',
        phaseNumber: 1,
        title: 'Implement agent capability discovery',
        objective: 'Implement clean MCP agent registration and dynamic role assignment.',
        instructions: '1. Inspect connected clients.\n2. Expose get_my_identity.\n3. Run test suite.',
        requirements: ['Node 18+', 'MCP SDK 1.30+'],
        constraints: ['No filesystem management in NavOS', 'Preserve Streamable HTTP'],
        expectedResult: 'Clean agent capability discovery without placeholder identities.',
        acceptanceCriteria: ['Passes test-identity.mjs', 'Passes test-e2e.mjs'],
        assignedWorker: 'Antigravity-IDE'
      }
    });
    assert(!createPhaseRes.isError, 'Commander created Phase 1 successfully');
    const phase1Data = JSON.parse(createPhaseRes.content[0].text);
    assert(phase1Data.phase_number === 1, 'Phase number is 1');
    assert(phase1Data.status === 'active', 'Phase status is active');

    // -------------------------------------------------------------------------
    // 9. Worker Retrieves Current Phase
    // -------------------------------------------------------------------------
    console.log('\n[STEP 9] Worker retrieves current active phase...');
    const currentPhaseRes = await clientWorker.callTool({
      name: 'get_current_phase',
      arguments: { project: 'NavOS AI Bridge' }
    });
    assert(!currentPhaseRes.isError, 'Worker retrieved current phase');
    const workerPhase = JSON.parse(currentPhaseRes.content[0].text);
    assert(workerPhase.phase_number === 1, 'Worker sees Phase 1');
    assert(workerPhase.title === 'Implement agent capability discovery', 'Worker sees correct phase title');
    assert(workerPhase.instructions.includes('Inspect connected clients'), 'Worker sees detailed instructions');
    assert(workerPhase.assigned_worker === 'Antigravity-IDE', 'Worker is assigned to the phase');
    assert(workerPhase.commander === 'ChatGPT', 'Worker sees commander identity (ChatGPT)');

    // -------------------------------------------------------------------------
    // 10. Worker Submits Detailed Implementation Report
    // -------------------------------------------------------------------------
    console.log('\n[STEP 10] Worker performs implementation and submits detailed Phase Report...');
    const submitReportRes = await clientWorker.callTool({
      name: 'submit_phase_report',
      arguments: {
        project: 'NavOS AI Bridge',
        phaseNumber: 1,
        status: 'completed',
        summary: 'Completed agent capability discovery implementation.',
        implementationDetails: 'Refactored sessions.ts with multi-client detection and provider inference. Cleaned identity.ts tools.',
        filesChanged: ['src/sessions.ts', 'src/tools/identity.ts', 'src/db.ts'],
        testsPerformed: 'node test-identity.mjs',
        testResults: 'All 10 assertions passed with zero errors.',
        decisionsMade: 'Used word-boundary regex detection for CLI vs IDE clients to avoid false positives.',
        recommendations: 'Phase 1 acceptance criteria met. Ready to advance to Phase 2.'
      }
    });
    assert(!submitReportRes.isError, 'submit_phase_report succeeded');
    const reportData = JSON.parse(submitReportRes.content[0].text);
    assert(reportData.report.phase_number === 1, 'Report recorded for Phase 1');
    assert(reportData.report.worker_id === 'Antigravity-IDE', 'Report author is Antigravity-IDE');
    assert(reportData.phase.status === 'under_review', 'Phase automatically transitioned to under_review');

    // -------------------------------------------------------------------------
    // 11. Commander Advances to Phase 2
    // -------------------------------------------------------------------------
    console.log('\n[STEP 11] Commander analyzes report and advances project to Phase 2...');
    const advanceRes = await clientCommander.callTool({
      name: 'advance_phase',
      arguments: {
        project: 'NavOS AI Bridge',
        completedPhaseNumber: 1,
        nextPhaseNumber: 2,
        notes: 'Phase 1 verified and approved. Moving to Phase 2.'
      }
    });
    assert(!advanceRes.isError, 'advance_phase succeeded');
    const advanceData = JSON.parse(advanceRes.content[0].text);
    assert(advanceData.completedPhase.status === 'completed', 'Phase 1 is now marked completed');
    assert(advanceData.nextPhaseNumber === 2, 'Next phase number is 2');

    // -------------------------------------------------------------------------
    // 12. Commander Requests Human Input (Workflow Pauses)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 12] Commander requests human input (workflow enters waiting state)...');
    const humanInputRes = await clientCommander.callTool({
      name: 'request_human_input',
      arguments: {
        project: 'NavOS AI Bridge',
        phaseNumber: 2,
        question: 'Should authentication use local API keys or OAuth2 PKCE?',
        reason: 'This architectural decision determines whether Phase 2 implements a token exchange endpoint.'
      }
    });
    assert(!humanInputRes.isError, 'request_human_input succeeded');
    const inputPayload = JSON.parse(humanInputRes.content[0].text);
    assert(inputPayload.status === 'waiting_human_input', 'Workflow entered waiting_human_input state');
    const inputId = inputPayload.id;

    // Check dashboard API reflects waiting state
    const dashProj = await fetch(`${BASE_URL}/api/projects`).then(r => r.json());
    const navosDash = dashProj.find(p => p.name === 'NavOS AI Bridge');
    assert(navosDash.workflowState === 'waiting_human_input', 'Dashboard reports workflowState: waiting_human_input');
    assert(navosDash.pendingInput && navosDash.pendingInput.id === inputId, 'Dashboard includes pendingInput details');

    // -------------------------------------------------------------------------
    // 13. Human Answers Question via Dashboard API (Workflow Resumes)
    // -------------------------------------------------------------------------
    console.log('\n[STEP 13] Human answers question through dashboard UI endpoint...');
    const answerRes = await fetch(`${BASE_URL}/api/projects/${encodeURIComponent('NavOS AI Bridge')}/human-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputId,
        response: 'Use local API keys for Prototype 1 simplicity.'
      })
    }).then(r => r.json());
    assert(answerRes.success === true, 'Human input submitted successfully');

    // Verify workflow state resumes
    const dashProjResumed = await fetch(`${BASE_URL}/api/projects`).then(r => r.json());
    const navosResumed = dashProjResumed.find(p => p.name === 'NavOS AI Bridge');
    assert(navosResumed.pendingInput === undefined || navosResumed.pendingInput === null, 'Pending input is resolved');

    // -------------------------------------------------------------------------
    // 14. Disconnect & Reconnect Testing
    // -------------------------------------------------------------------------
    console.log('\n[STEP 14] Testing Agent Disconnection and Reconnection...');
    await clientWorker.close();
    await new Promise(r => setTimeout(r, 400));

    const agentsAfterDisc = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
    const workerDisc = agentsAfterDisc.find(a => a.id === 'Antigravity-IDE');
    assert(workerDisc && !workerDisc.isCurrentlyConnected, 'Worker marked disconnected in /api/agents');

    // Reconnect Worker
    const transportWorker2 = new SSEClientTransport(new URL(`${BASE_URL}/sse?agent=Antigravity-IDE&client=ide`));
    const clientWorker2 = new Client({ name: 'Antigravity IDE', version: '1.2.0' }, { capabilities: {} });
    await clientWorker2.connect(transportWorker2);
    await new Promise(r => setTimeout(r, 250));

    const agentsAfterReconn = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
    const workerReconn = agentsAfterReconn.find(a => a.id === 'Antigravity-IDE');
    assert(workerReconn && workerReconn.isCurrentlyConnected, 'Worker seamlessly reconnected and marked connected');
    assert(workerReconn.role === 'Worker', 'Worker role preserved after reconnecting');

    await clientWorker2.close();

    // -------------------------------------------------------------------------
    // 15. Streamable HTTP Transport & Session Handling Verification
    // -------------------------------------------------------------------------
    console.log('\n[STEP 15] Testing Streamable HTTP Transport & Session Handling...');
    const initRes = await fetch(`${BASE_URL}/sse?agent=StreamableAgent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: { name: 'Claude Code', version: '1.0.0' },
          protocolVersion: '2025-11-25',
          capabilities: {}
        }
      })
    });

    const sessionId = initRes.headers.get('mcp-session-id');
    assert(sessionId && sessionId.length > 10, 'Streamable HTTP returned valid Mcp-Session-Id');
    assert(initRes.ok, 'Streamable HTTP initialize succeeded');

    // Send notifications/initialized as required by MCP spec
    await fetch(`${BASE_URL}/sse?agent=StreamableAgent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      })
    });

    // Call tools/list with Mcp-Session-Id header
    const toolsHttpRes = await fetch(`${BASE_URL}/sse?agent=StreamableAgent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });
    const rawText = await toolsHttpRes.text();
    let toolsHttpData;
    if (rawText.startsWith('event:') || rawText.includes('data:')) {
      const dataLine = rawText.split('\n').find(l => l.startsWith('data:'));
      toolsHttpData = JSON.parse(dataLine.replace(/^data:\s*/, ''));
    } else {
      toolsHttpData = JSON.parse(rawText);
    }
    assert(toolsHttpData.result && toolsHttpData.result.tools && toolsHttpData.result.tools.length === 10, `Streamable HTTP tools/list returned 10 tools (found ${toolsHttpData.result?.tools?.length || JSON.stringify(toolsHttpData)})`);

    // Clean session disconnect via DELETE /sse
    const deleteHttpRes = await fetch(`${BASE_URL}/sse?agent=StreamableAgent`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId }
    });
    assert(deleteHttpRes.ok, 'Streamable HTTP DELETE /sse closed session cleanly');

    console.log('\n================================================================');
    if (failures === 0) {
      console.log('🎉 ALL PROTOTYPE 1 ARCHITECTURE & ORCHESTRATION TESTS PASSED!');
    } else {
      console.error(`💥 ${failures} TESTS FAILED.`);
      process.exitCode = 1;
    }
    console.log('================================================================');

  } catch (err) {
    console.error('Fatal test execution error:', err);
    process.exitCode = 1;
  } finally {
    if (clientCommander) try { await clientCommander.close(); } catch {}
    if (clientWorker) try { await clientWorker.close(); } catch {}
  }
}

function logPass(msg) {
  console.log(`✅ PASS: ${msg}`);
}

runTests();
