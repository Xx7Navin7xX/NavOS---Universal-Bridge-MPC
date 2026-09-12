import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentRole,
  AgentType,
  PhaseStatus,
  ProjectRecord,
  ProjectAgentRecord,
  PhaseRecord,
  PhaseReportRecord,
  HumanInputRecord,
  AgentMessageRecord,
  AgentRecord
} from './types.js';

const dbPath = path.resolve(process.cwd(), 'data', 'bridge.db');

// Ensure data dir exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    model_name TEXT,
    client_location TEXT,
    agent_type TEXT,
    directory TEXT,
    client_name TEXT,
    client_version TEXT,
    provider TEXT NOT NULL DEFAULT 'Google Gemini',
    role TEXT NOT NULL DEFAULT 'Unassigned',
    current_project TEXT,
    status TEXT NOT NULL DEFAULT 'Disconnected',
    is_explicitly_connected INTEGER NOT NULL DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    workspace_info TEXT,
    directory TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_agents (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Worker',
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_name, agent_id)
  );

  CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    phase_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    instructions TEXT NOT NULL,
    requirements TEXT,
    constraints TEXT,
    expected_result TEXT,
    expected_outcome TEXT,
    notes TEXT,
    acceptance_criteria TEXT,
    assigned_worker TEXT,
    commander TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project, phase_number)
  );

  CREATE TABLE IF NOT EXISTS phase_reports (
    id TEXT PRIMARY KEY,
    phase_id TEXT NOT NULL,
    project TEXT NOT NULL,
    phase_number INTEGER NOT NULL,
    worker_id TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    work_performed TEXT,
    implementation_details TEXT,
    files_changed TEXT,
    tests_performed TEXT,
    test_results TEXT,
    problems TEXT,
    problems_encountered TEXT,
    blockers TEXT,
    questions TEXT,
    recommended_next_step TEXT,
    human_intervention_required INTEGER NOT NULL DEFAULT 0,
    unresolved_issues TEXT,
    decisions_made TEXT,
    recommendations TEXT,
    notes TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS human_inputs (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    phase_number INTEGER,
    commander_id TEXT NOT NULL,
    question TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    answered_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    project TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    agent_id TEXT,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations if columns exist
try { db.prepare("ALTER TABLE agents ADD COLUMN model_name TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN client_location TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN agent_type TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN directory TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN is_explicitly_connected INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN client_name TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE agents ADD COLUMN client_version TEXT").run(); } catch {}

try { db.prepare("ALTER TABLE projects ADD COLUMN description TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE projects ADD COLUMN workspace_info TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE projects ADD COLUMN directory TEXT").run(); } catch {}

try { db.prepare("ALTER TABLE phases ADD COLUMN expected_outcome TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phases ADD COLUMN notes TEXT").run(); } catch {}

try { db.prepare("ALTER TABLE phase_reports ADD COLUMN work_performed TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phase_reports ADD COLUMN problems TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phase_reports ADD COLUMN blockers TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phase_reports ADD COLUMN questions TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phase_reports ADD COLUMN recommended_next_step TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE phase_reports ADD COLUMN human_intervention_required INTEGER DEFAULT 0").run(); } catch {}

// ---------------------------------------------------------------------------
// Agent Records
// ---------------------------------------------------------------------------

export function connectAgent(params: {
  id: string;
  sessionId: string;
  modelName: string;
  clientLocation: string;
  agentType: AgentType;
  directory: string | null;
  provider?: string;
  role?: AgentRole;
  currentProject?: string | null;
}): AgentRecord {
  const stmt = db.prepare(`
    INSERT INTO agents (
      id, session_id, model_name, client_location, agent_type, directory,
      client_name, client_version, provider, role, current_project, status, is_explicitly_connected, last_seen
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Connected', 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      model_name = excluded.model_name,
      client_location = excluded.client_location,
      agent_type = excluded.agent_type,
      directory = excluded.directory,
      client_name = coalesce(excluded.client_name, agents.client_name),
      client_version = coalesce(excluded.client_version, agents.client_version),
      provider = coalesce(excluded.provider, agents.provider),
      role = coalesce(excluded.role, agents.role),
      current_project = coalesce(excluded.current_project, agents.current_project),
      status = 'Connected',
      is_explicitly_connected = 1,
      last_seen = CURRENT_TIMESTAMP
  `);

  stmt.run(
    params.id,
    params.sessionId,
    params.modelName,
    params.clientLocation,
    params.agentType,
    params.directory,
    params.clientLocation,
    '1.0.0',
    params.provider || 'AI',
    params.role || 'Unassigned',
    params.currentProject || null
  );

  return getAgent(params.id)!;
}

export function updateAgentClientInfo(id: string, clientName: string, clientVersion: string): void {
  db.prepare(`
    UPDATE agents
    SET client_name = ?, client_version = ?, last_seen = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(clientName, clientVersion, id);
}

export function getAgent(id: string): AgentRecord | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRecord | undefined;
}

export function getAllAgents(): AgentRecord[] {
  // Only return explicitly connected agents
  return db.prepare('SELECT * FROM agents WHERE is_explicitly_connected = 1 ORDER BY last_seen DESC').all() as AgentRecord[];
}

export function getExplicitlyConnectedAgents(): AgentRecord[] {
  return db.prepare("SELECT * FROM agents WHERE is_explicitly_connected = 1 AND status = 'Connected' ORDER BY last_seen DESC").all() as AgentRecord[];
}

export function resetConnectedAgentsOnStartup(): void {
  db.prepare("UPDATE agents SET status = 'Disconnected' WHERE status = 'Connected'").run();
}

export function setAgentStatus(id: string, status: string): void {
  db.prepare('UPDATE agents SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
}

export function setAgentRole(id: string, role: AgentRole): void {
  db.prepare('UPDATE agents SET role = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(role, id);
}

export function setAgentProject(id: string, project: string | null): void {
  db.prepare('UPDATE agents SET current_project = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(project, id);
}

export function touchAgent(id: string): void {
  db.prepare('UPDATE agents SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function deleteAgent(id: string): boolean {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRecord | undefined;
  if (!existing) return false;

  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM project_agents WHERE agent_id = ?').run(id);
    db.prepare('UPDATE phases SET assigned_worker = NULL WHERE assigned_worker = ?').run(id);
    db.prepare('UPDATE phases SET commander = NULL WHERE commander = ?').run(id);
    db.prepare('DELETE FROM agent_messages WHERE sender_id = ? OR recipient_id = ?').run(id, id);
    db.prepare('DELETE FROM agents WHERE id = ?').run(id);
  });

  deleteTx();
  return true;
}

// ---------------------------------------------------------------------------
// Project Records
// ---------------------------------------------------------------------------

const projectsCols = (db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>);
const hasRootPathCol = projectsCols.some(c => c.name === 'root_path');

export function registerProject(name: string, description?: string | null, workspaceInfo?: string | null, directory?: string | null): ProjectRecord {
  const dir = directory || workspaceInfo || null;
  const existing = db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRecord | undefined;
  if (existing) {
    if (description || workspaceInfo || dir) {
      db.prepare(`
        UPDATE projects
        SET description = coalesce(?, description),
            workspace_info = coalesce(?, workspace_info),
            directory = coalesce(?, directory)
        WHERE name = ?
      `).run(description || null, workspaceInfo || null, dir, name);
      return getProject(name)!;
    }
    return existing;
  }

  const id = uuidv4();
  if (hasRootPathCol) {
    db.prepare(`
      INSERT INTO projects (id, name, description, workspace_info, directory, root_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description || null, workspaceInfo || null, dir, dir || name);
  } else {
    db.prepare(`
      INSERT INTO projects (id, name, description, workspace_info, directory)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description || null, workspaceInfo || null, dir);
  }

  return {
    id,
    name,
    description: description || null,
    workspace_info: workspaceInfo || null,
    directory: dir,
    created_at: new Date().toISOString()
  };
}

export function getProject(name: string): ProjectRecord | undefined {
  return db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRecord | undefined;
}

export function getAllProjects(): ProjectRecord[] {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRecord[];
}

export function deleteProject(name: string): boolean {
  const existing = db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRecord | undefined;
  if (!existing) return false;

  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM phase_reports WHERE project = ?').run(name);
    db.prepare('DELETE FROM phases WHERE project = ?').run(name);
    db.prepare('DELETE FROM human_inputs WHERE project = ?').run(name);
    db.prepare('DELETE FROM agent_messages WHERE project = ?').run(name);
    db.prepare('DELETE FROM project_agents WHERE project_name = ?').run(name);
    db.prepare('UPDATE agents SET current_project = NULL WHERE current_project = ?').run(name);
    db.prepare('DELETE FROM projects WHERE name = ?').run(name);
  });

  deleteTx();
  return true;
}

// ---------------------------------------------------------------------------
// Project Agent Relationships & Roles
// ---------------------------------------------------------------------------

export function setProjectAgentRole(projectName: string, agentId: string, role: AgentRole): ProjectAgentRecord {
  registerProject(projectName);

  const existing = db.prepare(`
    SELECT * FROM project_agents WHERE project_name = ? AND agent_id = ?
  `).get(projectName, agentId) as ProjectAgentRecord | undefined;

  if (existing) {
    db.prepare(`
      UPDATE project_agents SET role = ?, assigned_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(role, existing.id);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO project_agents (id, project_name, agent_id, role)
      VALUES (?, ?, ?, ?)
    `).run(id, projectName, agentId, role);
  }

  // Also sync current_project and role on agent record
  setAgentProject(agentId, projectName);
  setAgentRole(agentId, role);

  return (db.prepare('SELECT * FROM project_agents WHERE project_name = ? AND agent_id = ?').get(projectName, agentId) as ProjectAgentRecord);
}

export function getProjectAgents(projectName: string): Array<ProjectAgentRecord & {
  model_name: string | null;
  client_location: string | null;
  agent_type: AgentType | null;
  directory: string | null;
  client_name: string | null;
  client_version: string | null;
  provider: string;
  status: string;
}> {
  return db.prepare(`
    SELECT pa.*, a.model_name, a.client_location, a.agent_type, a.directory, a.client_name, a.client_version, a.provider, a.status
    FROM project_agents pa
    JOIN agents a ON pa.agent_id = a.id
    WHERE pa.project_name = ?
  `).all(projectName) as any;
}

export function getAgentProjectRole(projectName: string, agentId: string): AgentRole | null {
  const row = db.prepare(`
    SELECT role FROM project_agents WHERE project_name = ? AND agent_id = ?
  `).get(projectName, agentId) as { role: AgentRole } | undefined;
  return row ? row.role : null;
}

// ---------------------------------------------------------------------------
// Phase Operations
// ---------------------------------------------------------------------------

export function createPhase(params: {
  project: string;
  phaseNumber: number;
  title: string;
  objective?: string;
  instructions: string;
  requirements?: string | string[] | null;
  constraints?: string | string[] | null;
  expectedResult?: string | null;
  expectedOutcome?: string | null;
  notes?: string | null;
  acceptanceCriteria?: string | string[] | null;
  assignedWorker?: string | null;
  commander?: string | null;
}): PhaseRecord {
  registerProject(params.project);

  const reqStr = Array.isArray(params.requirements) ? JSON.stringify(params.requirements) : params.requirements || null;
  const conStr = Array.isArray(params.constraints) ? JSON.stringify(params.constraints) : params.constraints || null;
  const accStr = Array.isArray(params.acceptanceCriteria) ? JSON.stringify(params.acceptanceCriteria) : params.acceptanceCriteria || null;
  const outcome = params.expectedOutcome || params.expectedResult || null;
  const objective = params.objective || params.title;

  const existing = db.prepare(`
    SELECT * FROM phases WHERE project = ? AND phase_number = ?
  `).get(params.project, params.phaseNumber) as PhaseRecord | undefined;

  if (existing) {
    db.prepare(`
      UPDATE phases SET
        title = ?, objective = ?, instructions = ?, requirements = ?,
        constraints = ?, expected_result = ?, expected_outcome = ?, notes = ?, acceptance_criteria = ?,
        assigned_worker = coalesce(?, assigned_worker),
        commander = coalesce(?, commander),
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      params.title,
      objective,
      params.instructions,
      reqStr,
      conStr,
      outcome,
      outcome,
      params.notes || null,
      accStr,
      params.assignedWorker || null,
      params.commander || null,
      existing.id
    );
    return getPhaseById(existing.id)!;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO phases (
      id, project, phase_number, title, objective, instructions,
      requirements, constraints, expected_result, expected_outcome, notes, acceptance_criteria,
      assigned_worker, commander, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    id,
    params.project,
    params.phaseNumber,
    params.title,
    objective,
    params.instructions,
    reqStr,
    conStr,
    outcome,
    outcome,
    params.notes || null,
    accStr,
    params.assignedWorker || null,
    params.commander || null
  );

  return getPhaseById(id)!;
}

export function getPhaseById(id: string): PhaseRecord | undefined {
  return db.prepare('SELECT * FROM phases WHERE id = ?').get(id) as PhaseRecord | undefined;
}

export function getPhaseByNumber(project: string, phaseNumber: number): PhaseRecord | undefined {
  return db.prepare('SELECT * FROM phases WHERE project = ? AND phase_number = ?').get(project, phaseNumber) as PhaseRecord | undefined;
}

export function getCurrentPhase(project: string): PhaseRecord | undefined {
  const active = db.prepare(`
    SELECT * FROM phases
    WHERE project = ? AND status IN ('active', 'under_review', 'waiting_human_input')
    ORDER BY phase_number DESC
    LIMIT 1
  `).get(project) as PhaseRecord | undefined;

  if (active) return active;

  return db.prepare(`
    SELECT * FROM phases
    WHERE project = ?
    ORDER BY phase_number DESC
    LIMIT 1
  `).get(project) as PhaseRecord | undefined;
}

export function getProjectPhases(project: string): PhaseRecord[] {
  return db.prepare('SELECT * FROM phases WHERE project = ? ORDER BY phase_number ASC').all(project) as PhaseRecord[];
}

export function setPhaseStatus(phaseId: string, status: PhaseStatus): void {
  db.prepare('UPDATE phases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, phaseId);
}

export function advancePhase(project: string, completedPhaseNumber: number, nextPhaseNumber?: number, notes?: string): { completedPhase: PhaseRecord | undefined, nextPhaseNumber: number } {
  const phase = getPhaseByNumber(project, completedPhaseNumber);
  if (phase) {
    setPhaseStatus(phase.id, 'completed');
  }

  const nextNum = nextPhaseNumber || (completedPhaseNumber + 1);

  logActivity('phase_advanced', `Project '${project}' advanced past Phase ${completedPhaseNumber} (Next: Phase ${nextNum})`, null, {
    project,
    completedPhaseNumber,
    nextPhaseNumber: nextNum,
    notes
  });

  return {
    completedPhase: phase ? getPhaseById(phase.id) : undefined,
    nextPhaseNumber: nextNum
  };
}

// ---------------------------------------------------------------------------
// Phase Reports
// ---------------------------------------------------------------------------

export function createPhaseReport(params: {
  phaseId: string;
  project: string;
  phaseNumber: number;
  workerId: string;
  status: string;
  summary: string;
  workPerformed?: string | null;
  implementationDetails?: string | null;
  filesChanged?: string[] | string | null;
  testsPerformed?: string | null;
  testResults?: string | null;
  problems?: string | null;
  problemsEncountered?: string | null;
  blockers?: string | null;
  questions?: string | null;
  recommendedNextStep?: string | null;
  humanInterventionRequired?: boolean | number;
  unresolvedIssues?: string | null;
  decisionsMade?: string | null;
  recommendations?: string | null;
  notes?: string | null;
}): PhaseReportRecord {
  const id = uuidv4();
  const filesStr = Array.isArray(params.filesChanged) ? JSON.stringify(params.filesChanged) : params.filesChanged || null;
  const humanReq = params.humanInterventionRequired ? 1 : 0;
  const work = params.workPerformed || params.implementationDetails || null;
  const probs = params.problems || params.problemsEncountered || null;
  const recStep = params.recommendedNextStep || params.recommendations || null;

  db.prepare(`
    INSERT INTO phase_reports (
      id, phase_id, project, phase_number, worker_id, status, summary,
      work_performed, implementation_details, files_changed, tests_performed, test_results,
      problems, problems_encountered, blockers, questions, recommended_next_step, human_intervention_required,
      unresolved_issues, decisions_made, recommendations, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.phaseId,
    params.project,
    params.phaseNumber,
    params.workerId,
    params.status,
    params.summary,
    work,
    work,
    filesStr,
    params.testsPerformed || null,
    params.testResults || null,
    probs,
    probs,
    params.blockers || null,
    params.questions || null,
    recStep,
    humanReq,
    params.unresolvedIssues || null,
    params.decisionsMade || null,
    recStep,
    params.notes || null
  );

  // If human intervention is required, update phase status to waiting_human_input
  if (humanReq === 1) {
    setPhaseStatus(params.phaseId, 'waiting_human_input');
  } else {
    setPhaseStatus(params.phaseId, 'under_review');
  }

  return (db.prepare('SELECT * FROM phase_reports WHERE id = ?').get(id) as PhaseReportRecord);
}

export function getPhaseReports(phaseId: string): PhaseReportRecord[] {
  return db.prepare('SELECT * FROM phase_reports WHERE phase_id = ? ORDER BY submitted_at DESC').all(phaseId) as PhaseReportRecord[];
}

export function getLatestPhaseReport(phaseId: string): PhaseReportRecord | undefined {
  return db.prepare('SELECT * FROM phase_reports WHERE phase_id = ? ORDER BY submitted_at DESC LIMIT 1').get(phaseId) as PhaseReportRecord | undefined;
}

export function getPhaseReport(project: string, phaseNumber?: number): PhaseReportRecord | undefined {
  if (phaseNumber !== undefined) {
    return db.prepare('SELECT * FROM phase_reports WHERE project = ? AND phase_number = ? ORDER BY submitted_at DESC LIMIT 1').get(project, phaseNumber) as PhaseReportRecord | undefined;
  }
  return db.prepare('SELECT * FROM phase_reports WHERE project = ? ORDER BY submitted_at DESC LIMIT 1').get(project) as PhaseReportRecord | undefined;
}

// ---------------------------------------------------------------------------
// Human Input Requests & Responses
// ---------------------------------------------------------------------------

export function createHumanInput(params: {
  project: string;
  phaseNumber?: number | null;
  commanderId: string;
  question: string;
  reason: string;
}): HumanInputRecord {
  registerProject(params.project);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO human_inputs (id, project, phase_number, commander_id, question, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, params.project, params.phaseNumber || null, params.commanderId, params.question, params.reason);

  if (params.phaseNumber) {
    const phase = getPhaseByNumber(params.project, params.phaseNumber);
    if (phase) {
      setPhaseStatus(phase.id, 'waiting_human_input');
    }
  }

  logActivity('human_input_requested', `Human input requested for project '${params.project}': ${params.question}`, params.commanderId, {
    project: params.project,
    question: params.question,
    reason: params.reason
  });

  return (db.prepare('SELECT * FROM human_inputs WHERE id = ?').get(id) as HumanInputRecord);
}

export function getPendingHumanInput(project: string): HumanInputRecord | undefined {
  return db.prepare(`
    SELECT * FROM human_inputs WHERE project = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1
  `).get(project) as HumanInputRecord | undefined;
}

export function getProjectHumanInputs(project: string): HumanInputRecord[] {
  return db.prepare('SELECT * FROM human_inputs WHERE project = ? ORDER BY created_at DESC').all(project) as HumanInputRecord[];
}

export function answerHumanInput(id: string, response: string): HumanInputRecord | undefined {
  db.prepare(`
    UPDATE human_inputs
    SET response = ?, status = 'answered', answered_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(response, id);

  const input = db.prepare('SELECT * FROM human_inputs WHERE id = ?').get(id) as HumanInputRecord | undefined;
  if (input && input.phase_number) {
    const phase = getPhaseByNumber(input.project, input.phase_number);
    if (phase && phase.status === 'waiting_human_input') {
      setPhaseStatus(phase.id, 'active');
    }
  }

  if (input) {
    logActivity('human_input_answered', `Human input answered for project '${input.project}'`, null, {
      id,
      project: input.project,
      response
    });
  }

  return input;
}

// ---------------------------------------------------------------------------
// Agent Messages
// ---------------------------------------------------------------------------

export function createAgentMessage(senderId: string, recipientId: string | null, project: string | null, message: string): AgentMessageRecord {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO agent_messages (id, sender_id, recipient_id, project, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, senderId, recipientId || null, project || null, message);

  return (db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as AgentMessageRecord);
}

export function getAgentMessages(project?: string, limit: number = 50): AgentMessageRecord[] {
  if (project) {
    return db.prepare('SELECT * FROM agent_messages WHERE project = ? ORDER BY created_at DESC LIMIT ?').all(project, limit) as AgentMessageRecord[];
  }
  return db.prepare('SELECT * FROM agent_messages ORDER BY created_at DESC LIMIT ?').all(limit) as AgentMessageRecord[];
}

// ---------------------------------------------------------------------------
// Activity Logging
// ---------------------------------------------------------------------------

export interface ActivityRecord {
  id: string;
  event_type: string;
  message: string;
  agent_id: string | null;
  details: string | null;
  timestamp: string;
}

export function logActivity(eventType: string, message: string, agentId?: string | null, details?: any): void {
  const id = uuidv4();
  const detailsStr = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;
  try {
    db.prepare(`
      INSERT INTO activity_log (id, event_type, message, agent_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, eventType, message, agentId || null, detailsStr);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export function getActivityLog(limit: number = 50): ActivityRecord[] {
  return db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?').all(limit) as ActivityRecord[];
}
