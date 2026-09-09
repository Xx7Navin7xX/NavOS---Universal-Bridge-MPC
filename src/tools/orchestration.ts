import { z } from 'zod';
import { EventEmitter } from 'events';
import { McpTool, AgentRole } from '../types.js';
import {
  registerProject,
  getProject,
  getProjectAgents,
  getAgentProjectRole,
  createPhase,
  getCurrentPhase,
  getPhaseByNumber,
  createPhaseReport,
  getPhaseReport,
  getLatestPhaseReport,
  createAgentMessage,
  logActivity
} from '../db.js';
import { sessionRegistry } from '../sessions.js';

// Global Event Emitter for reactive phase wake-ups
export const phaseNotifier = new EventEmitter();
phaseNotifier.setMaxListeners(200);

export function notifyPhaseWaiters(project: string, phase: any): void {
  phaseNotifier.emit(`new_phase:${project}`, phase);
  phaseNotifier.emit('new_phase_any', { project, phase });
}

export function waitForPhaseEvent(project: string, afterPhaseNumber: number, timeoutMs: number = 300000): Promise<{ status: 'ready' | 'timeout', phase?: any }> {
  return new Promise((resolve) => {
    // Check if phase already exists
    const current = getCurrentPhase(project);
    if (current && current.phase_number > afterPhaseNumber) {
      resolve({ status: 'ready', phase: current });
      return;
    }

    let timer: NodeJS.Timeout | null = null;

    const onNewPhase = (phase: any) => {
      if (phase && phase.phase_number > afterPhaseNumber) {
        cleanup();
        resolve({ status: 'ready', phase });
      }
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      phaseNotifier.removeListener(`new_phase:${project}`, onNewPhase);
    };

    timer = setTimeout(() => {
      cleanup();
      resolve({ status: 'timeout' });
    }, timeoutMs);

    phaseNotifier.on(`new_phase:${project}`, onNewPhase);
  });
}

// ---------------------------------------------------------------------------
// 1. register_project
// ---------------------------------------------------------------------------
export const registerProjectTool: McpTool = {
  name: 'register_project',
  description: 'Registers a workspace/project in NavOS AI Bridge. ONLY NATIVE agents with a local workspace directory are permitted to register projects. WEB agents without a local filesystem are prohibited. Multiple native agents may register the same project directory independently.',
  schema: z.object({
    project_name: z.string().describe('Target project or workspace name (e.g. "NavOS AI Bridge", "RetroArch")'),
    directory: z.string().optional().describe('Local absolute project directory (defaults to your connected workspace directory)'),
    description: z.string().optional().describe('Brief description of the project workspace')
  }),
  handler: async ({ project_name, directory, description }, ctx) => {
    // Permission check: WEB agents are strictly prohibited
    if (ctx.agentType === 'WEB' || (!ctx.directory && !directory)) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `Permission denied: Only NATIVE agents with a local workspace directory can register projects. WEB agents cannot register projects.`
        }]
      };
    }

    try {
      const workspaceDir = directory || ctx.directory || null;
      const proj = registerProject(project_name.trim(), description || null, workspaceDir, workspaceDir);

      if (ctx.agentId) {
        ctx.activeProject = proj.name;
        sessionRegistry.updateAgentProject(ctx.agentId, proj.name);
      }

      logActivity('project_registered', `Native agent '${ctx.agentId || 'anonymous'}' registered project '${proj.name}' (Dir: ${workspaceDir})`, ctx.agentId, {
        project: proj.name,
        directory: workspaceDir,
        description
      });

      sessionRegistry.broadcast('project_updated', { project: proj.name });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project_name: proj.name,
            directory: proj.directory || proj.workspace_info,
            description: proj.description,
            registering_agent: ctx.agentId,
            agent_type: ctx.agentType,
            message: `Project '${proj.name}' successfully registered. Commander and Worker roles must be assigned by the human in the NavOS Web UI.`
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to register project: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 2. get_project
// ---------------------------------------------------------------------------
export const getProjectTool: McpTool = {
  name: 'get_project',
  description: 'Retrieves complete project status: current phase, instructions, commander, assigned worker, human intervention state, and latest activity.',
  schema: z.object({
    project: z.string().describe('Target project name')
  }),
  handler: async ({ project }) => {
    const proj = getProject(project);
    if (!proj) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Project '${project}' not found.` }]
      };
    }

    const agents = getProjectAgents(proj.name);
    const currentPhase = getCurrentPhase(proj.name);
    const latestReport = currentPhase ? getLatestPhaseReport(currentPhase.id) : null;

    const commanderAgent = agents.find(a => a.role === 'Commander');
    const workerAgent = agents.find(a => a.role === 'Worker');

    let phaseStatusLabel = 'No active phase';
    let humanInterventionRequired = false;

    if (currentPhase) {
      phaseStatusLabel = currentPhase.status;
      if (currentPhase.status === 'waiting_human_input' || (latestReport && latestReport.human_intervention_required === 1)) {
        humanInterventionRequired = true;
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          project: proj.name,
          directory: proj.directory || proj.workspace_info,
          description: proj.description,
          commander: commanderAgent ? {
            agent_id: commanderAgent.agent_id,
            model_name: commanderAgent.model_name,
            client_location: commanderAgent.client_location,
            agent_type: commanderAgent.agent_type
          } : null,
          worker: workerAgent ? {
            agent_id: workerAgent.agent_id,
            model_name: workerAgent.model_name,
            client_location: workerAgent.client_location,
            agent_type: workerAgent.agent_type,
            directory: workerAgent.directory
          } : null,
          current_phase: currentPhase ? {
            phase_number: currentPhase.phase_number,
            title: currentPhase.title,
            status: currentPhase.status,
            instructions: currentPhase.instructions,
            expected_outcome: currentPhase.expected_outcome || currentPhase.expected_result,
            notes: currentPhase.notes
          } : null,
          human_intervention_required: humanInterventionRequired,
          latest_report: latestReport ? {
            phase_number: latestReport.phase_number,
            status: latestReport.status,
            summary: latestReport.summary,
            work_performed: latestReport.work_performed,
            human_intervention_required: latestReport.human_intervention_required === 1,
            submitted_at: latestReport.submitted_at
          } : null
        }, null, 2)
      }]
    };
  }
};

// ---------------------------------------------------------------------------
// 3. create_phase
// ---------------------------------------------------------------------------
export const createPhaseTool: McpTool = {
  name: 'create_phase',
  description: 'Used ONLY by the assigned Commander to create and launch the next sequential implementation phase for the Worker. Supports long, detailed prompts and clear expected outcomes.',
  schema: z.object({
    project: z.string().describe('Target project name'),
    phase_number: z.number().int().positive().describe('Phase number (e.g. 1, 2, 3...)'),
    title: z.string().describe('Short phase title'),
    instructions: z.string().describe('Detailed, step-by-step implementation instructions for the worker'),
    expected_outcome: z.string().describe('Precise expected deliverables or verification criteria'),
    notes: z.string().optional().describe('Optional architecture notes or context')
  }),
  handler: async ({ project, phase_number, title, instructions, expected_outcome, notes }, ctx) => {
    // Permission check: Only Commander can create phases
    const roleInProject = ctx.agentId ? getAgentProjectRole(project, ctx.agentId) : null;
    const effectiveRole = roleInProject || ctx.role;

    if (effectiveRole === 'Worker') {
      return {
        isError: true,
        content: [{ type: 'text', text: `Permission denied: Agent '${ctx.agentId}' is assigned as Worker and cannot create Commander phases.` }]
      };
    }

    try {
      const phase = createPhase({
        project,
        phaseNumber: phase_number,
        title,
        instructions,
        expectedOutcome: expected_outcome,
        notes: notes || null,
        commander: ctx.agentId || 'Commander'
      });

      logActivity('phase_created', `Commander created Phase ${phase.phase_number} for '${project}': ${phase.title}`, ctx.agentId, {
        project,
        phase_number,
        title
      });

      sessionRegistry.broadcast('phase_created', phase);

      // Signal any waiting background tasks / Worker wait_for_phase
      notifyPhaseWaiters(project, phase);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            project: phase.project,
            phase_number: phase.phase_number,
            title: phase.title,
            status: phase.status,
            expected_outcome: phase.expected_outcome,
            message: `Phase ${phase.phase_number} created successfully. Worker waiting task has been signaled.`
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to create phase: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 4. submit_phase_report
// ---------------------------------------------------------------------------
export const submitPhaseReportTool: McpTool = {
  name: 'submit_phase_report',
  description: 'Used ONLY by the assigned Worker to submit a detailed implementation report after executing a phase. If human intervention is required, set human_intervention_required to true to halt autonomous progression.',
  schema: z.object({
    project: z.string().describe('Target project name'),
    phase_number: z.number().int().positive().describe('Phase number completed or reported'),
    summary: z.string().describe('Executive summary of what was accomplished'),
    work_performed: z.string().describe('Detailed technical explanation of the implementation changes made'),
    files_changed: z.array(z.string()).optional().describe('List of files modified, created, or deleted'),
    tests_performed: z.string().optional().describe('Tests executed and verification metrics'),
    problems: z.string().optional().describe('Challenges or obstacles encountered during work'),
    blockers: z.string().optional().describe('Unresolved blockers or blockers requiring human decision'),
    questions: z.string().optional().describe('Questions for Commander or human'),
    recommended_next_step: z.string().optional().describe('Recommended next steps for subsequent phases'),
    human_intervention_required: z.boolean().optional().describe('Set to true if autonomous progression must STOP until a human provides clarification or input')
  }),
  handler: async (args, ctx) => {
    // Permission check: Workers only
    const roleInProject = ctx.agentId ? getAgentProjectRole(args.project, ctx.agentId) : null;
    const effectiveRole = roleInProject || ctx.role;

    if (effectiveRole === 'Commander') {
      return {
        isError: true,
        content: [{ type: 'text', text: `Permission denied: Agent '${ctx.agentId}' is assigned as Commander and cannot submit Worker reports.` }]
      };
    }

    const phase = getPhaseByNumber(args.project, args.phase_number);
    if (!phase) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Phase ${args.phase_number} not found for project '${args.project}'.` }]
      };
    }

    try {
      const isHumanRequired = Boolean(args.human_intervention_required);

      const report = createPhaseReport({
        phaseId: phase.id,
        project: args.project,
        phaseNumber: args.phase_number,
        workerId: ctx.agentId || 'Worker',
        status: isHumanRequired ? 'waiting_human_input' : 'completed',
        summary: args.summary,
        workPerformed: args.work_performed,
        filesChanged: args.files_changed,
        testsPerformed: args.tests_performed,
        problems: args.problems,
        blockers: args.blockers,
        questions: args.questions,
        recommendedNextStep: args.recommended_next_step,
        humanInterventionRequired: isHumanRequired
      });

      logActivity('phase_reported', `Worker submitted Phase ${args.phase_number} report for '${args.project}' (Human required: ${isHumanRequired})`, ctx.agentId, {
        project: args.project,
        phase_number: args.phase_number,
        human_intervention_required: isHumanRequired
      });

      sessionRegistry.broadcast('phase_reported', {
        project: args.project,
        phase_number: args.phase_number,
        report_id: report.id,
        human_intervention_required: isHumanRequired
      });

      sessionRegistry.broadcast('project_updated', { project: args.project });

      const msg = isHumanRequired
        ? `Report for Phase ${args.phase_number} submitted. HUMAN INTERVENTION REQUIRED: Autonomous loop halted until human input is provided.`
        : `Report for Phase ${args.phase_number} submitted successfully. Commander may now inspect the report and prepare Phase ${args.phase_number + 1}.`;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            report_id: report.id,
            project: args.project,
            phase_number: args.phase_number,
            status: report.status,
            human_intervention_required: isHumanRequired,
            message: msg
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to submit phase report: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 5. get_phase_report
// ---------------------------------------------------------------------------
export const getPhaseReportTool: McpTool = {
  name: 'get_phase_report',
  description: 'Used by the Commander (and agents) to retrieve the detailed Worker implementation report for a specific phase or the latest phase.',
  schema: z.object({
    project: z.string().describe('Target project name'),
    phase_number: z.number().int().positive().optional().describe('Phase number to inspect (defaults to latest reported phase)')
  }),
  handler: async ({ project, phase_number }) => {
    const report = getPhaseReport(project, phase_number);
    if (!report) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No phase report found for project '${project}'${phase_number ? ` phase ${phase_number}` : ''}.` }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          project: report.project,
          phase_number: report.phase_number,
          worker_id: report.worker_id,
          status: report.status,
          summary: report.summary,
          work_performed: report.work_performed || report.implementation_details,
          files_changed: report.files_changed ? JSON.parse(report.files_changed) : [],
          tests_performed: report.tests_performed,
          problems: report.problems || report.problems_encountered,
          blockers: report.blockers,
          questions: report.questions,
          recommended_next_step: report.recommended_next_step,
          human_intervention_required: report.human_intervention_required === 1,
          submitted_at: report.submitted_at
        }, null, 2)
      }]
    };
  }
};

// ---------------------------------------------------------------------------
// 6. send_agent_message
// ---------------------------------------------------------------------------
export const sendAgentMessageTool: McpTool = {
  name: 'send_agent_message',
  description: 'General agent-to-agent communication tool. Use to send coordination notes, questions, or updates. Note: Do not use for formal phase instructions or reports.',
  schema: z.object({
    message: z.string().describe('Message content'),
    recipient_id: z.string().optional().describe('Target agent ID (omit for project-wide broadcast)'),
    project: z.string().optional().describe('Related project name')
  }),
  handler: async ({ message, recipient_id, project }, ctx) => {
    try {
      const senderId = ctx.agentId || 'anonymous';
      const msg = createAgentMessage(senderId, recipient_id || null, project || null, message);

      logActivity('agent_message', `Message from '${senderId}'${recipient_id ? ` to '${recipient_id}'` : ''}: ${message.slice(0, 100)}`, senderId, {
        senderId,
        recipientId: recipient_id,
        project,
        message
      });

      sessionRegistry.broadcast('agent_message', {
        id: msg.id,
        sender_id: senderId,
        recipient_id: recipient_id || null,
        project: project || null,
        message,
        created_at: msg.created_at
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message_id: msg.id,
            sender_id: senderId,
            recipient_id: recipient_id || 'broadcast',
            project: project || null,
            sent_at: msg.created_at
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to send agent message: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 7. wait_for_phase
// ---------------------------------------------------------------------------
export const waitForPhaseTool: McpTool = {
  name: 'wait_for_phase',
  description: 'Used by the Worker after completing a phase to wait for the Commander to create the next phase. Blocks/waits until a new phase is launched. Can be executed directly or run via a background waiting command (e.g. curl /api/projects/:name/wait-phase) so the host runtime automatically wakes the AI.',
  schema: z.object({
    project: z.string().describe('Target project name'),
    after_phase_number: z.number().int().nonnegative().describe('The phase number just completed (waits for phase > after_phase_number)'),
    timeout_seconds: z.number().int().positive().max(600).optional().describe('Maximum seconds to wait (default 300, max 600)')
  }),
  handler: async ({ project, after_phase_number, timeout_seconds = 300 }) => {
    const timeoutMs = timeout_seconds * 1000;
    const result = await waitForPhaseEvent(project, after_phase_number, timeoutMs);

    if (result.status === 'timeout') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'timeout',
            project,
            after_phase_number,
            message: `Wait timed out after ${timeout_seconds}s. Next phase has not yet been created by the Commander.`
          }, null, 2)
        }]
      };
    }

    const phase = result.phase;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ready',
          project,
          new_phase_number: phase.phase_number,
          title: phase.title,
          instructions: phase.instructions,
          expected_outcome: phase.expected_outcome || phase.expected_result,
          notes: phase.notes,
          message: `Phase ${phase.phase_number} is ready. Worker can now proceed with implementation.`
        }, null, 2)
      }]
    };
  }
};

export const orchestrationTools: McpTool[] = [
  registerProjectTool,
  getProjectTool,
  createPhaseTool,
  submitPhaseReportTool,
  getPhaseReportTool,
  sendAgentMessageTool,
  waitForPhaseTool
];
