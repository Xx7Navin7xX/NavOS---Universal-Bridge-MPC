// ============================================================================
// NavOS Universal AI Bridge MCP Redesign - 20-Point Verification Test Suite
// ============================================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import * as path from 'path';

const BASE_URL = 'http://127.0.0.1:3020';
const PROJECT = `TestProj_${Date.now()}`;

let testFailures = 0;

function assert(condition, description, detail = '') {
  if (condition) {
    console.log(`✅ PASS: ${description}`);
  } else {
    console.error(`❌ FAIL: ${description} ${detail}`);
    testFailures++;
  }
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING NAVOS REDESIGN 20-POINT COMPREHENSIVE VERIFICATION');
  console.log('================================================================\n');

  let clientWebCommander = null;
  let clientNativeWorker1 = null;
  let clientNativeWorker2 = null;
  let clientRaw = null;

  try {
    // Clean test state before starting verification
    await fetch(`${BASE_URL}/api/test/reset`, { method: 'POST' }).catch(() => {});
    await fetch(`${BASE_URL}/api/test/grace-period`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 0 }) }).catch(() => {});

    // -------------------------------------------------------------------------
    // TEST 1: MCP connection alone does NOT register an agent in Connected Agents
    // -------------------------------------------------------------------------
    console.log('[CHECK 1] Testing that raw MCP connection does NOT register an agent in UI/API...');
    const rawTransport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    clientRaw = new Client({ name: 'RawClient', version: '1.0.0' }, { capabilities: {} });
    await clientRaw.connect(rawTransport);
    await new Promise(r => setTimeout(r, 200));

    const initialAgents = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
    assert(initialAgents.length === 0, 'No agents visible in /api/agents before connect_to_mpc', `Found: ${initialAgents.length}`);

    // Verify tool surface: 13 target tools
    const toolsList = await clientRaw.listTools();
    const toolNames = toolsList.tools.map(t => t.name).sort();
    const expected13Tools = [
      'connect_to_mpc',
      'create_phase',
      'get_agents',
      'get_phase_report',
      'get_project',
      'get_server_status',
      'git_diff',
      'git_log',
      'git_status',
      'register_project',
      'send_agent_message',
      'submit_phase_report',
      'wait_for_phase'
    ].sort();
    assert(toolNames.length === 13, `MCP tool surface has exactly 13 tools (found ${toolNames.length})`);
    assert(JSON.stringify(toolNames) === JSON.stringify(expected13Tools), 'Tool list matches target 13 tools exactly');

    // Verify unauthorized call blocked before connect_to_mpc
    const blockedCall = await clientRaw.callTool({ name: 'get_project', arguments: { project: 'Test' } });
    assert(blockedCall.isError === true, 'Unauthorized tool call blocked before connect_to_mpc');

    // -------------------------------------------------------------------------
    // TEST 2 & 3: connect_to_mpc registers a WEB agent (directory = null)
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 2 & 3] Connecting WEB Agent (ChatGPT Web PC, directory = null)...');
    const webTransport = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    clientWebCommander = new Client({ name: 'ChatGPT', version: '1.0.0' }, { capabilities: {} });
    await clientWebCommander.connect(webTransport);

    const connectWebRes = await clientWebCommander.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'GPT-5.6 Luna',
        client_location: 'ChatGPT Web PC',
        directory: null
      }
    });
    const webData = JSON.parse(connectWebRes.content[0].text);
    assert(!connectWebRes.isError && webData.success === true, 'connect_to_mpc succeeded for WEB agent');
    assert(webData.agent_type === 'WEB', 'WEB agent derived agent_type: WEB');
    assert(webData.directory === null, 'WEB agent directory is null');
    const webAgentId = webData.agent_id;

    // -------------------------------------------------------------------------
    // TEST 4: connect_to_mpc registers a NATIVE agent (has directory)
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 4] Connecting NATIVE Agent 1 (Antigravity CLI, with directory)...');
    const nativeTransport1 = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    clientNativeWorker1 = new Client({ name: 'Antigravity', version: '1.0.0' }, { capabilities: {} });
    await clientNativeWorker1.connect(nativeTransport1);

    const testDir = path.resolve(process.cwd());
    const connectNativeRes1 = await clientNativeWorker1.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Gemini 3.8 Flash',
        client_location: 'Antigravity CLI',
        directory: testDir
      }
    });
    const nativeData1 = JSON.parse(connectNativeRes1.content[0].text);
    assert(!connectNativeRes1.isError && nativeData1.success === true, 'connect_to_mpc succeeded for NATIVE agent 1');
    assert(nativeData1.agent_type === 'NATIVE', 'NATIVE agent derived agent_type: NATIVE');
    assert(nativeData1.directory === testDir, 'NATIVE agent preserved exact directory');
    const nativeWorker1Id = nativeData1.agent_id;

    // -------------------------------------------------------------------------
    // TEST 5: WEB agent cannot register a project
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 5] Testing WEB agent cannot register project...');
    const webRegProjRes = await clientWebCommander.callTool({
      name: 'register_project',
      arguments: { project_name: PROJECT }
    });
    assert(webRegProjRes.isError === true, 'WEB agent calling register_project was rejected with an error');

    // -------------------------------------------------------------------------
    // TEST 6: NATIVE agent can register a project
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 6] Testing NATIVE agent can register project...');
    const nativeRegProjRes = await clientNativeWorker1.callTool({
      name: 'register_project',
      arguments: { project_name: PROJECT, description: 'Universal test project' }
    });
    const projData = JSON.parse(nativeRegProjRes.content[0].text);
    assert(!nativeRegProjRes.isError && projData.success === true, 'NATIVE agent successfully registered AlphaProject');

    // -------------------------------------------------------------------------
    // TEST 7 & 8: Second native agent connects to SAME directory & appears independently
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 7 & 8] Connecting NATIVE Agent 2 (Codex CLI, same directory)...');
    const nativeTransport2 = new SSEClientTransport(new URL(`${BASE_URL}/sse`));
    clientNativeWorker2 = new Client({ name: 'Codex', version: '1.0.0' }, { capabilities: {} });
    await clientNativeWorker2.connect(nativeTransport2);

    const connectNativeRes2 = await clientNativeWorker2.callTool({
      name: 'connect_to_mpc',
      arguments: {
        model_name: 'Claude 3.5 Sonnet',
        client_location: 'Codex CLI',
        directory: testDir
      }
    });
    const nativeData2 = JSON.parse(connectNativeRes2.content[0].text);
    const nativeWorker2Id = nativeData2.agent_id;
    assert(nativeWorker1Id !== nativeWorker2Id, 'Second native agent assigned unique agent ID');

    // Register same project from agent 2
    const nativeRegProjRes2 = await clientNativeWorker2.callTool({
      name: 'register_project',
      arguments: { project_name: PROJECT }
    });
    assert(!nativeRegProjRes2.isError, 'Second native agent registered same project/directory without collision');

    // Verify both appear as separate agents in get_agents and /api/agents
    const getAgentsRes = await clientNativeWorker1.callTool({ name: 'get_agents', arguments: {} });
    const agentsList = JSON.parse(getAgentsRes.content[0].text);
    const hasAgent1 = agentsList.some(a => a.agent_id === nativeWorker1Id && a.model_name === 'Gemini 3.8 Flash');
    const hasAgent2 = agentsList.some(a => a.agent_id === nativeWorker2Id && a.model_name === 'Claude 3.5 Sonnet');
    assert(hasAgent1 && hasAgent2, 'Both native agents on same directory appear independently in get_agents');

    // -------------------------------------------------------------------------
    // TEST 9: Agents cannot assign themselves Commander/Worker
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 9] Verifying connect_to_mpc & register_project do not accept role self-assignment...');
    assert(nativeData1.role === 'Unassigned', 'Native agent initialized with role Unassigned (no role self-selection)');

    // -------------------------------------------------------------------------
    // TEST 10 & 11: UI can assign Commander and Worker
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 10 & 11] Assigning Commander (WEB) and Worker (NATIVE 1) via UI API...');
    const assignRolesRes = await fetch(`${BASE_URL}/api/projects/${PROJECT}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commanderId: webAgentId,
        workerId: nativeWorker1Id
      })
    }).then(r => r.json());
    assert(assignRolesRes.success === true, 'UI successfully assigned Commander and Worker');

    // Verify in get_project
    const getProjRes = await clientWebCommander.callTool({ name: 'get_project', arguments: { project: PROJECT } });
    const projDetails = JSON.parse(getProjRes.content[0].text);
    assert(projDetails.commander?.agent_id === webAgentId, 'get_project shows assigned Commander');
    assert(projDetails.worker?.agent_id === nativeWorker1Id, 'get_project shows assigned Worker');

    // -------------------------------------------------------------------------
    // TEST 12: WEB agent cannot become Worker
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 12] Verifying WEB agent cannot be assigned as Worker...');
    const rejectWebWorkerRes = await fetch(`${BASE_URL}/api/projects/${PROJECT}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: webAgentId
      })
    });
    assert(rejectWebWorkerRes.status === 400, 'Assigning WEB agent as Worker returned HTTP 400 rejection');
    const rejectJson = await rejectWebWorkerRes.json();
    assert(rejectJson.error.includes('WEB agents cannot be assigned the Worker role'), 'Rejection message clearly states WEB agents are ineligible as Workers');

    // -------------------------------------------------------------------------
    // TEST 13: Commander creates Phase 1
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 13] Commander creating Phase 1...');
    const createPhaseRes = await clientWebCommander.callTool({
      name: 'create_phase',
      arguments: {
        project: PROJECT,
        phase_number: 1,
        title: 'Initial Scaffolding',
        instructions: 'Setup repository configuration, review directory structure, and verify environment.',
        expected_outcome: 'Working config and clean git status.'
      }
    });
    const phaseData = JSON.parse(createPhaseRes.content[0].text);
    assert(!createPhaseRes.isError && phaseData.success === true, 'Commander successfully created Phase 1');

    // Worker cannot create phase
    const workerCreatePhaseRes = await clientNativeWorker1.callTool({
      name: 'create_phase',
      arguments: {
        project: PROJECT,
        phase_number: 2,
        title: 'Illegal Phase',
        instructions: 'Test',
        expected_outcome: 'None'
      }
    });
    assert(workerCreatePhaseRes.isError === true, 'Worker attempting to create phase was rejected');

    // -------------------------------------------------------------------------
    // TEST 14: Worker submits Phase 1 report
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 14] Worker submitting Phase 1 report...');
    const submitReportRes = await clientNativeWorker1.callTool({
      name: 'submit_phase_report',
      arguments: {
        project: PROJECT,
        phase_number: 1,
        summary: 'Completed directory setup and verified dependencies.',
        work_performed: 'Inspected src directory and ran build check.',
        files_changed: ['package.json'],
        tests_performed: 'npm run build',
        recommended_next_step: 'Proceed to Phase 2.'
      }
    });
    const reportData = JSON.parse(submitReportRes.content[0].text);
    assert(!submitReportRes.isError && reportData.success === true, 'Worker successfully submitted phase report');

    // -------------------------------------------------------------------------
    // TEST 15: Commander retrieves Worker report
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 15] Commander retrieving Phase 1 report...');
    const getReportRes = await clientWebCommander.callTool({
      name: 'get_phase_report',
      arguments: { project: PROJECT, phase_number: 1 }
    });
    const retrievedReport = JSON.parse(getReportRes.content[0].text);
    assert(retrievedReport.phase_number === 1, 'Commander retrieved correct phase report');
    assert(retrievedReport.worker_id === nativeWorker1Id, 'Report matches submitting worker');

    // -------------------------------------------------------------------------
    // TEST 16: wait_for_phase correctly waits for next phase
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 16] Testing wait_for_phase (Worker waits, Commander launches Phase 2)...');
    let waitPromiseResolved = false;
    let waitResult = null;

    // Launch wait_for_phase in background
    const waitPromise = clientNativeWorker1.callTool({
      name: 'wait_for_phase',
      arguments: {
        project: PROJECT,
        after_phase_number: 1,
        timeout_seconds: 5
      }
    }).then(res => {
      waitPromiseResolved = true;
      waitResult = JSON.parse(res.content[0].text);
      return waitResult;
    });

    // Verify it's waiting
    await new Promise(r => setTimeout(r, 150));
    assert(!waitPromiseResolved, 'wait_for_phase is blocking while waiting for Phase 2');

    // Commander creates Phase 2
    await clientWebCommander.callTool({
      name: 'create_phase',
      arguments: {
        project: PROJECT,
        phase_number: 2,
        title: 'Core Implementation',
        instructions: 'Implement core functionality.',
        expected_outcome: 'Feature implemented.'
      }
    });

    await waitPromise;
    assert(waitPromiseResolved === true, 'wait_for_phase was released when Phase 2 was created');
    assert(waitResult?.new_phase_number === 2, 'wait_for_phase returned Phase 2 details');

    // Also test HTTP endpoint /api/projects/:name/wait-phase
    const httpWaitRes = await fetch(`${BASE_URL}/api/projects/${PROJECT}/wait-phase?afterPhase=1&timeout=2`).then(r => r.json());
    assert(httpWaitRes.status === 'ready' && httpWaitRes.phase.phase_number === 2, 'HTTP /wait-phase endpoint immediately returns available Phase 2');

    // -------------------------------------------------------------------------
    // TEST 17: Human-intervention state stops autonomous progression
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 17] Testing human intervention blocker stops autonomous progression...');
    const blockerReportRes = await clientNativeWorker1.callTool({
      name: 'submit_phase_report',
      arguments: {
        project: PROJECT,
        phase_number: 2,
        summary: 'Encountered architectural ambiguity regarding data store.',
        work_performed: 'Drafted schema options.',
        blockers: 'Unclear whether to use SQLite or JSON.',
        human_intervention_required: true
      }
    });
    const blockerData = JSON.parse(blockerReportRes.content[0].text);
    assert(blockerData.human_intervention_required === true, 'Report flagged human_intervention_required: true');

    const projCheck = await clientWebCommander.callTool({ name: 'get_project', arguments: { project: PROJECT } });
    const projCheckData = JSON.parse(projCheck.content[0].text);
    assert(projCheckData.human_intervention_required === true, 'Project state is marked human_intervention_required: true');
    assert(projCheckData.current_phase.status === 'waiting_human_input', 'Phase status transitioned to waiting_human_input');

    // Human submits input via UI API
    const humanInputRes = await fetch(`${BASE_URL}/api/projects/${PROJECT}/human-input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'Use SQLite for local durability.' })
    }).then(r => r.json());
    assert(humanInputRes.success === true, 'Human input submitted via UI API');

    const projCheckAfter = await clientWebCommander.callTool({ name: 'get_project', arguments: { project: PROJECT } });
    const projAfterData = JSON.parse(projCheckAfter.content[0].text);
    assert(projAfterData.current_phase.status === 'active', 'Project phase cleared back to active after human input');

    // -------------------------------------------------------------------------
    // TEST 18: Read-only Git tools
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 18] Testing read-only Git tools (git_status, git_diff, git_log)...');
    const gitStatusRes = await clientWebCommander.callTool({
      name: 'git_status',
      arguments: { project: PROJECT }
    });
    assert(!gitStatusRes.isError && gitStatusRes.content[0].text.length > 0, 'git_status executed and returned branch info');

    const gitDiffRes = await clientWebCommander.callTool({
      name: 'git_diff',
      arguments: { project: PROJECT }
    });
    assert(!gitDiffRes.isError && gitDiffRes.content[0].text.length > 0, 'git_diff executed and returned diff info');

    const gitLogRes = await clientWebCommander.callTool({
      name: 'git_log',
      arguments: { project: PROJECT, limit: 3 }
    });
    assert(!gitLogRes.isError && gitLogRes.content[0].text.length > 0, 'git_log executed and returned commit info');

    // -------------------------------------------------------------------------
    // TEST 19: Disconnected agents disappear from active Connected Agents UI
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 19] Testing disconnected agents disappear from active Connected Agents...');
    const agentsBeforeClose = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
    assert(agentsBeforeClose.length === 3, `Found 3 active agents before close (got: ${agentsBeforeClose.length})`);

    // Close clientNativeWorker2 transport
    await nativeTransport2.close();
    await new Promise(r => setTimeout(r, 250));

    const agentsAfterClose = await fetch(`${BASE_URL}/api/agents`).then(r => r.json());
    assert(agentsAfterClose.length === 2, `Disconnected agent removed from active list (now: ${agentsAfterClose.length})`);
    assert(!agentsAfterClose.some(a => a.id === nativeWorker2Id), 'Closed agent is no longer present in /api/agents');

    // -------------------------------------------------------------------------
    // TEST 20: send_agent_message and get_server_status
    // -------------------------------------------------------------------------
    console.log('\n[CHECK 20] Testing send_agent_message and get_server_status...');
    const msgRes = await clientWebCommander.callTool({
      name: 'send_agent_message',
      arguments: {
        message: 'Proceeding to verify final tests.',
        project: PROJECT
      }
    });
    const msgData = JSON.parse(msgRes.content[0].text);
    assert(!msgRes.isError && msgData.success === true, 'send_agent_message succeeded');

    const statusRes = await clientNativeWorker1.callTool({ name: 'get_server_status', arguments: {} });
    const statusData = JSON.parse(statusRes.content[0].text);
    assert(statusData.status === 'online', 'get_server_status returned online');
    assert(statusData.registered_projects >= 1, 'get_server_status reports registered projects');

  } catch (err) {
    console.error('Unhandled exception during verification test:', err);
    testFailures++;
  } finally {
    try { if (clientRaw) await clientRaw.close(); } catch {}
    try { if (clientWebCommander) await clientWebCommander.close(); } catch {}
    try { if (clientNativeWorker1) await clientNativeWorker1.close(); } catch {}
    try { if (clientNativeWorker2) await clientNativeWorker2.close(); } catch {}
    await fetch(`${BASE_URL}/api/test/grace-period`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: 45 }) }).catch(() => {});
  }

  console.log('\n================================================================');
  if (testFailures === 0) {
    console.log('🎉 ALL 20 TEST VERIFICATIONS PASSED SUCCESSFULLY!');
  } else {
    console.error(`❌ VERIFICATION FINISHED WITH ${testFailures} FAILURES.`);
  }
  console.log('================================================================\n');

  process.exit(testFailures === 0 ? 0 : 1);
}

runVerification();
