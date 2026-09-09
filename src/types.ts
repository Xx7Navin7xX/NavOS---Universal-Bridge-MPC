import { z } from 'zod';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';

export type AgentRole = 'Commander' | 'Worker' | 'Observer' | 'Reviewer' | 'Tester' | 'Manager' | 'Unassigned';

export type AgentType = 'NATIVE' | 'WEB';

export type PhaseStatus = 'active' | 'under_review' | 'completed' | 'waiting_human_input';

export interface SessionContext {
  sessionId: string;
  agentId: string | null;
  modelName?: string;
  clientLocation?: string;
  agentType?: AgentType;
  directory?: string | null;
  role: AgentRole;
  provider: string;
  activeProject: string | null;
  isExplicitlyConnected?: boolean;
}

export interface McpTool<T = any> {
  name: string;
  description: string;
  schema: z.ZodSchema<T>;
  handler: (args: T, ctx: SessionContext) => Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>;
}

export function getToolDefinition(tool: McpTool) {
  const rawSchema = toJsonSchemaCompat(tool.schema as any) as any;
  const inputSchema = {
    type: 'object' as const,
    properties: rawSchema?.properties || {},
    ...(rawSchema?.required ? { required: rawSchema.required } : {})
  };
  return {
    name: tool.name,
    description: tool.description,
    inputSchema,
  };
}

export interface AgentRecord {
  id: string;
  session_id: string | null;
  model_name: string | null;
  client_location: string | null;
  agent_type: AgentType | null;
  directory: string | null;
  client_name: string | null;
  client_version: string | null;
  provider: string;
  role: string;
  current_project: string | null;
  status: string;
  is_explicitly_connected: number;
  last_seen: string;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  workspace_info: string | null;
  directory?: string | null;
  created_at: string;
}

export interface ProjectAgentRecord {
  id: string;
  project_name: string;
  agent_id: string;
  role: AgentRole;
  assigned_at: string;
}

export interface PhaseRecord {
  id: string;
  project: string;
  phase_number: number;
  title: string;
  objective: string;
  instructions: string;
  requirements: string | null;
  constraints: string | null;
  expected_result: string | null;
  expected_outcome?: string | null;
  notes?: string | null;
  acceptance_criteria: string | null;
  assigned_worker: string | null;
  commander: string | null;
  status: PhaseStatus;
  created_at: string;
  updated_at: string;
}

export interface PhaseReportRecord {
  id: string;
  phase_id: string;
  project: string;
  phase_number: number;
  worker_id: string;
  status: string;
  summary: string;
  work_performed: string | null;
  implementation_details: string | null;
  files_changed: string | null;
  tests_performed: string | null;
  test_results: string | null;
  problems: string | null;
  problems_encountered: string | null;
  blockers: string | null;
  questions: string | null;
  recommended_next_step: string | null;
  human_intervention_required: number;
  unresolved_issues: string | null;
  decisions_made: string | null;
  recommendations: string | null;
  notes: string | null;
  submitted_at: string;
}

export interface HumanInputRecord {
  id: string;
  project: string;
  phase_number: number | null;
  commander_id: string;
  question: string;
  reason: string;
  status: 'pending' | 'answered';
  response: string | null;
  created_at: string;
  answered_at: string | null;
}

export interface AgentMessageRecord {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  project: string | null;
  message: string;
  created_at: string;
}
