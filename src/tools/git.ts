import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { McpTool } from '../types.js';
import { getProject } from '../db.js';

const execFileAsync = promisify(execFile);

function resolveProjectDir(projectNameOrDir: string, ctxDir?: string | null): string | null {
  const proj = getProject(projectNameOrDir);
  if (proj && proj.directory && fs.existsSync(proj.directory)) {
    return proj.directory;
  }
  if (proj && proj.workspace_info && fs.existsSync(proj.workspace_info)) {
    return proj.workspace_info;
  }
  if (fs.existsSync(projectNameOrDir)) {
    return path.resolve(projectNameOrDir);
  }
  if (ctxDir && fs.existsSync(ctxDir)) {
    return ctxDir;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. git_status
// ---------------------------------------------------------------------------
export const gitStatusTool: McpTool = {
  name: 'git_status',
  description: 'Read-only Git inspection: returns working tree status for the project workspace. Used especially by WEB Commanders to inspect native workspace state.',
  schema: z.object({
    project: z.string().describe('Project name or local workspace directory'),
    agent_id: z.string().optional().describe('Your persistent NavOS agent_id (e.g. "agent-3")')
  }),
  handler: async ({ project }, ctx) => {
    const dir = resolveProjectDir(project, ctx.directory);
    if (!dir) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Directory for project '${project}' not found or does not exist on this host.` }]
      };
    }

    try {
      const { stdout, stderr } = await execFileAsync('git', ['status', '--short', '--branch'], {
        cwd: dir,
        timeout: 10000
      });

      return {
        content: [{
          type: 'text',
          text: stdout || stderr || 'Clean working tree. Nothing to commit.'
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Git status failed in ${dir}: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 2. git_diff
// ---------------------------------------------------------------------------
export const gitDiffTool: McpTool = {
  name: 'git_diff',
  description: 'Read-only Git inspection: returns diff of uncommitted changes or specific file in the project workspace.',
  schema: z.object({
    project: z.string().describe('Project name or local workspace directory'),
    staged: z.boolean().optional().describe('Whether to view staged changes (--cached)'),
    filePath: z.string().optional().describe('Optional relative file path to restrict diff output'),
    agent_id: z.string().optional().describe('Your persistent NavOS agent_id (e.g. "agent-3")')
  }),
  handler: async ({ project, staged, filePath }, ctx) => {
    const dir = resolveProjectDir(project, ctx.directory);
    if (!dir) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Directory for project '${project}' not found or does not exist on this host.` }]
      };
    }

    const args = ['diff'];
    if (staged) args.push('--cached');
    if (filePath) {
      args.push('--', filePath);
    }

    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: dir,
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 5 // 5MB limit
      });

      return {
        content: [{
          type: 'text',
          text: stdout.trim() || 'No differences found.'
        }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Git diff failed in ${dir}: ${err.message || String(err)}` }]
      };
    }
  }
};

// ---------------------------------------------------------------------------
// 3. git_log
// ---------------------------------------------------------------------------
export const gitLogTool: McpTool = {
  name: 'git_log',
  description: 'Read-only Git inspection: returns recent commit history for the project workspace.',
  schema: z.object({
    project: z.string().describe('Project name or local workspace directory'),
    limit: z.number().int().positive().optional().describe('Number of commits to return (default 10, max 50)'),
    agent_id: z.string().optional().describe('Your persistent NavOS agent_id (e.g. "agent-3")')
  }),
  handler: async ({ project, limit = 10 }, ctx) => {
    const dir = resolveProjectDir(project, ctx.directory);
    if (!dir) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Directory for project '${project}' not found or does not exist on this host.` }]
      };
    }

    try {
      const { stdout } = await execFileAsync('git', ['log', `-n`, String(Math.min(limit, 50)), '--oneline', '--decorate'], {
        cwd: dir,
        timeout: 10000
      });

      return {
        content: [{
          type: 'text',
          text: stdout.trim() || 'No commit history found.'
        }]
      };
    } catch (err: any) {
      if (err.message && err.message.includes('does not have any commits yet')) {
        return {
          content: [{
            type: 'text',
            text: 'Repository has no commits yet on this branch.'
          }]
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: `Git log failed in ${dir}: ${err.message || String(err)}` }]
      };
    }
  }
};

export const gitTools: McpTool[] = [
  gitStatusTool,
  gitDiffTool,
  gitLogTool
];
