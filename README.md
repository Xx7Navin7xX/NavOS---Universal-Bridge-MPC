# NavOS — Universal AI Collaboration Bridge (Prototype 1)

A local, production-ready AI Collaboration Bridge and Web Dashboard designed to coordinate multiple independent AI sessions. 

Prototype 1 enables **two simultaneous Gemini sessions** running in separate Antigravity windows to collaborate securely as **Commander** and **Worker** via Model Context Protocol (MCP) with persistent SQLite task queues and real-time Web Dashboard oversight.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │             LOCAL WEB DASHBOARD              │
                      │           http://127.0.0.1:3020/             │
                      │  - Real-time Agent Status & Role Assignment  │
                      │  - Project Manager & Workspace Isolation     │
                      │  - Kanban Task Board & SSE Activity Stream   │
                      └──────────────────────┬───────────────────────┘
                                             │ REST / SSE (/api/stream)
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │         UNIVERSAL AI BRIDGE CORE             │
                      │           (Express on port 3020)             │
                      │  - Session Registry: Maps connections to     │
                      │    Gemini-01 & Gemini-02 identities          │
                      │  - Role Enforcer: Commander vs Worker rules  │
                      │  - Task Lifecycle Engine (SQLite-backed)     │
                      └───────────────┬──────────────┬───────────────┘
                                      │              │
                 MCP SSE (/sse?agent=Gemini-01)      │ MCP SSE (/sse?agent=Gemini-02)
                                      │              │
                                      ▼              ▼
                            ANTIGRAVITY WINDOW 1   ANTIGRAVITY WINDOW 2
                                (Gemini-01)            (Gemini-02)
                              Role: COMMANDER        Role: WORKER
```

---

## Key Features

- **Multi-Agent Identity & Tracking**: Distinguishes between multiple Gemini sessions connecting from different Antigravity windows (`Gemini-01`, `Gemini-02`) and tracks their live status (`Connected` / `Disconnected`).
- **Server-Side Role Enforcement**:
  - **Commander**: Dispatches structured tasks, selects project scopes, inspects results, and delegates work to workers.
  - **Worker**: Inspects assigned queues, claims tasks, performs isolated file/git operations, and submits structured execution results.
  - **Security**: Workers cannot assign tasks or elevate their own privileges.
- **Persistent Task Lifecycle**: Tasks are saved to SQLite (`data/bridge.db`) through states: `pending` ➔ `claimed` ➔ `in_progress` ➔ `completed` / `failed`.
- **Dynamic Project Isolation**: Safe path traversal guards (`sanitizePath`), dynamic project registration, and per-agent workspace scoping.
- **Real-Time Web Dashboard**: Built with vanilla HTML/CSS/JavaScript. Features live SSE streaming for agent connection status, Kanban task board, and event activity feed.
- **Local & Secure**: Binds strictly to `127.0.0.1:3020`. No cloud APIs, no external hosting, no paid services, no ngrok required.

---

## Quick Start

### 1. Prerequisites
- Node.js v18+ (tested on Node v24)
- npm

### 2. Installation
```powershell
npm install
npm run build
```

### 3. Start the Bridge Server
```powershell
npm start
```
The server will start on `http://127.0.0.1:3020`.
- **Web Dashboard**: `http://127.0.0.1:3020/`
- **MCP SSE Endpoint**: `http://127.0.0.1:3020/sse`
- **Health Check**: `http://127.0.0.1:3020/health`

---

## Antigravity Connection Guide

### Window 1 — Gemini Commander
Add this configuration to your workspace `.agents/mcp_config.json` or user `mcp_config.json`:
```json
{
  "mcpServers": {
    "universal-bridge": {
      "type": "sse",
      "serverUrl": "http://127.0.0.1:3020/sse?agent=Gemini-01"
    }
  }
}
```
In the Window 1 chat:
> *"Connect to the universal-bridge MCP server. Call `get_my_identity` to verify you are Gemini-01 (Commander)."*

### Window 2 — Gemini Worker
Add this configuration to your second workspace `.agents/mcp_config.json` or user `mcp_config.json`:
```json
{
  "mcpServers": {
    "universal-bridge": {
      "type": "sse",
      "serverUrl": "http://127.0.0.1:3020/sse?agent=Gemini-02"
    }
  }
}
```
In the Window 2 chat:
> *"Connect to the universal-bridge MCP server. Call `get_my_identity` to verify you are Gemini-02 (Worker)."*

---

## Collaboration Workflow

1. **Project Selection**:
   Commander calls `select_project({ project: "RetroArch Test" })`.
2. **Task Delegation**:
   Commander calls `assign_task({ worker: "Gemini-02", title: "Build Report", description: "Write build.txt" })`.
   - Task enters SQLite as `pending`.
   - Dashboard Kanban board displays the task immediately.
3. **Task Retrieval & Claim**:
   Worker calls `get_assigned_tasks({ status: "pending" })`, followed by `claim_task({ taskId: "..." })`.
   - Status moves to `claimed` / `in_progress`.
4. **Execution**:
   Worker reads/writes files or checks git status inside the sandboxed project directory.
5. **Result Submission**:
   Worker calls `submit_task_result({ taskId: "...", status: "completed", result: "Build passed" })`.
   - Status moves to `completed`.
6. **Commander Review**:
   Commander calls `get_task_status({ taskId: "..." })` to inspect the results.

---

## MCP Tools Reference

| Tool Name | Role / Scope | Description |
| :--- | :--- | :--- |
| `get_my_identity` | All Agents | Returns verified agent ID, role, active project, and session ID. |
| `register_agent` | All Agents | Handshake tool to register or claim an agent identity. |
| `get_agents` | All Agents | Lists all registered agents and their connection status. |
| `assign_task` | Commander Only | Creates and assigns a structured task to a designated worker. |
| `get_assigned_tasks`| All Agents | Retrieves tasks assigned to caller (Worker) or created by caller (Commander). |
| `claim_task` | Worker Only | Claims an assigned pending task. |
| `submit_task_result`| Worker Only | Submits completed result payload or failure details. |
| `get_task_status` | All Agents | Inspects full task lifecycle, payloads, and results. |
| `create_project` | All Agents | Registers a new local project directory. |
| `get_projects` | All Agents | Lists all available configured and dynamically registered projects. |
| `select_project` | All Agents | Sets the active project for the current session. |
| `get_current_project`| All Agents | Returns active project and root path. |
| `list_files` | Project Scope | Lists files in active project (path-guarded). |
| `read_file` | Project Scope | Reads file content within active project. |
| `write_file` | Project Scope | Writes file content within active project. |
| `apply_patch` | Project Scope | Applies unified diff patch to a project file. |
| `git_status` | Project Scope | Runs `git status` in active project. |
| `git_diff` | Project Scope | Runs `git diff` in active project. |
| `git_log` | Project Scope | Runs `git log` in active project. |
| `run_command` | Project Scope | Runs allowlisted shell commands (`git`, `npm`, `echo`, `dir`, `ls`). |
| `get_server_status` | Diagnostics | Returns server uptime, version, and project configuration. |
| `send_agent_message`| Collaboration | Free-form message exchange with verified sender identity. |
| `get_agent_messages` | Collaboration | Retrieves project messages or messages targeted to caller. |
| `publish_context` | Collaboration | Publishes shared structured context data. |
| `get_shared_context`| Collaboration | Retrieves shared context data by key. |

---

## Automated Verification

To run the complete end-to-end test suite:
```powershell
npm test
```
This runs:
1. `test-e2e.mjs`: Simulates dual simultaneous SSE client connections (`Gemini-01` and `Gemini-02`), tests role security, task dispatch, worker claim, result submission, commander retrieval, dashboard state, and reconnect resilience.
2. `test-preserved-tools.mjs`: Validates that all legacy file, git, command, diagnostic, and messaging tools remain 100% operational.
