import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ProjectConfig {
  [name: string]: string; // name -> absolute path
}

export interface ServerConfig {
  port: number;
  projects: ProjectConfig;
  allowCommands: boolean;
  allowedCommands: string[];
}

function loadConfig(): ServerConfig {
  const configPath = path.resolve(process.cwd(), 'config', 'config.json');
  let projects: ProjectConfig = {};
  let allowCommands = false;
  let allowedCommands: string[] = [];

  if (fs.existsSync(configPath)) {
    try {
      const fileData = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(fileData);
      
      if (parsed.projects && typeof parsed.projects === 'object') {
        projects = parsed.projects;
      }
      if (typeof parsed.allowCommands === 'boolean') {
        allowCommands = parsed.allowCommands;
      }
      if (Array.isArray(parsed.allowedCommands)) {
        allowedCommands = parsed.allowedCommands;
      }
    } catch (e) {
      console.error('[WARN] Failed to parse config.json:', e);
    }
  }

  // Ensure paths are absolute and normalized
  for (const [name, p] of Object.entries(projects)) {
    projects[name] = path.normalize(path.resolve(p));
  }

  return {
    port: parseInt(process.env.PORT || '3020', 10),
    projects,
    allowCommands,
    allowedCommands
  };
}

export const config = loadConfig();

import { getAllProjects, registerProject } from './db.js';

export function syncConfigProjectsToDb(): void {
  for (const [name, p] of Object.entries(config.projects)) {
    registerProject(name, p as string);
  }
}

export function getProjectRoot(projectName: string): string | null {
  const p = config.projects[projectName];
  if (p) return p;
  try {
    const fromDb = getAllProjects().find(proj => proj.name === projectName);
    if (fromDb && fromDb.workspace_info) {
      config.projects[fromDb.name] = fromDb.workspace_info;
      return fromDb.workspace_info;
    }
  } catch (err) {
    // db might not be ready yet
  }
  return null;
}

