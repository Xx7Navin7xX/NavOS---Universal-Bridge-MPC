# NavOS - Universal AI Bridge 

> A local-first communication and orchestration bridge for connecting multiple AI agents through a shared coordination layer.

Ths README gonna be huge sorry for that..

NavOS - Universal AI Bridge is an experimental multi-agent orchestration system designed to allow different AI agents, models, IDE assistants, and AI clients to communicate through a centralized local bridge.

The project was created around a simple idea:

**Let different AI agents work together on the same project without requiring the user to manually copy information between them.**

NavOS provides the coordination layer while the connected AI agents remain responsible for their own reasoning, tools, files, terminals, IDEs, and development environments.

<img width="1917" height="973" alt="image" src="https://github.com/user-attachments/assets/8c5f3422-c839-4cab-ba93-8a83bf6c6ba2" />

---

<p align="center">
  <a href="https://www.youtube.com/watch?v=IPpBt0XnYww">
    <img src="https://youtube.com" alt="Watch the video" width="100%">
  </a>
</p>

---

## ⚠️ Project Status

**Experimental / Research Project**

NavOS is currently a research and experimentation project.

The current implementation demonstrates:

- AI agent registration
- Persistent logical agent identities
- Native and web agent classification
- Project registration
- Commander / Worker roles
- Multi-phase project workflows
- Agent-to-agent message routing
- Phase reports
- Project state tracking
- Persistent SQLite state
- MCP-based communication
- Autonomous worker wake-up experiments
- Stateless and stateful MCP session handling
- Agent lifecycle management
- Role-based project access
- Local-first operation
- Secure MCP tunneling for remote AI clients

However, the project is **not currently presented as a finished production-ready agent-to-agent protocol**.

One of the major findings during development was that MCP itself is primarily designed around AI clients communicating with MCP servers and tools. True general-purpose agent-to-agent interoperability is a broader problem.

Because of that, the future architecture of NavOS may evolve toward an MCP + A2A-style hybrid or another dedicated agent communication mechanism.

Development is currently paused while the correct long-term multi-agent communication architecture is being evaluated.

---

# Table of Contents

- [What is NavOS?](#what-is-navos)
- [The Problem](#the-problem)
- [The Idea](#the-idea)
- [Architecture](#architecture)
- [Core Concepts](#core-concepts)
- [Agent Types](#agent-types)
- [Agent Identity](#agent-identity)
- [Commander and Worker](#commander-and-worker)
- [Project System](#project-system)
- [Phase-Based Workflow](#phase-based-workflow)
- [Autonomous Workflow](#autonomous-workflow)
- [MCP Communication](#mcp-communication)
- [Why MCP Was Used](#why-mcp-was-used)
- [Important MCP Limitation](#important-mcp-limitation)
- [Session and Identity Design](#session-and-identity-design)
- [Database](#database)
- [Dashboard](#dashboard)
- [Security](#security)
- [Privacy](#privacy)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running NavOS](#running-navos)
- [Connecting an Agent](#connecting-an-agent)
- [Registering a Project](#registering-a-project)
- [Commander / Worker Workflow](#commander--worker-workflow)
- [Remote Access](#remote-access)
- [Development](#development)
- [Testing Commands](#testing-commands)
- [Design Decisions](#design-decisions)
- [What NavOS Does Not Do](#what-navos-does-not-do)
- [Known Limitations](#known-limitations)
- [Future Direction](#future-direction)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Credits](#credits)

---

# What is NavOS?

NavOS is a **local-first AI coordination bridge**.

It is designed to sit between multiple AI agents and provide a shared place where they can:

- identify themselves
- discover other connected agents
- register projects
- determine their assigned role
- create project phases
- execute phases
- report results
- communicate with other agents
- track project progress
- coordinate work without constantly requiring the human to copy/paste information

The important design principle is:

> **NavOS coordinates the agents. It does not replace their native working environments.**

For example:

- Gemini can continue working inside Antigravity IDE.
- Codex can continue working inside its own environment.
- ChatGPT can act as a web-based Commander.
- Each native agent can continue using its own filesystem, terminal, editor, compiler, Git tools, and other capabilities.

NavOS provides the shared coordination layer between them.

<img width="1917" height="853" alt="image" src="https://github.com/user-attachments/assets/4a8e6866-09d4-427d-acd4-76cbd35d8d78" />

---

# The Problem

Modern AI development tools are becoming increasingly capable, but different AI systems often operate independently.

A typical workflow might look like this:

```text
Human
  │
  ├── Ask ChatGPT for a plan
  │
  ├── Copy plan
  │
  ├── Paste into Gemini
  │
  ├── Gemini modifies files
  │
  ├── Copy Gemini's result
  │
  ├── Paste into ChatGPT
  │
  ├── ChatGPT reviews
  │
  └── Repeat
````

The human becomes the communication bus.

This creates several problems:

* repetitive copy/paste
* loss of context
* duplicated explanations
* difficulty coordinating multiple agents
* no shared project state
* no persistent agent identity
* no structured task progression
* difficult autonomous workflows

NavOS experiments with another model:

```text
                 ┌─────────────────┐
                 │     Human       │
                 └────────┬────────┘
                          │
                          ▼
                 ┌─────────────────┐
                 │     NavOS       │
                 │  AI Bridge      │
                 └───────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
     ┌─────────┐    ┌──────────┐   ┌─────────┐
     │ ChatGPT │    │  Gemini  │   │  Codex  │
     │  Web    │    │Antigravity│  │ Desktop │
     └─────────┘    └──────────┘   └─────────┘
```

The goal is to allow the agents to coordinate through NavOS rather than forcing the human to manually relay every message.

<img width="1917" height="1143" alt="image" src="https://github.com/user-attachments/assets/831fd72a-b43a-4afb-af76-21a8e70f360f" />

---

# The Idea

NavOS separates the system into three major layers.

## 1. AI Agents

The actual AI systems perform reasoning and work.

Examples:

* ChatGPT
* Gemini
* Codex
* IDE-integrated AI agents
* Other MCP-compatible AI clients

---

## 2. NavOS

NavOS provides:

* agent identity
* agent registration
* project membership
* role assignment
* phase management
* communication
* state tracking
* coordination

---

## 3. Native Agent Environment

Native agents retain control over their own environment.

For example:

```text
Antigravity / Gemini
        │
        ├── Files
        ├── Terminal
        ├── Git
        ├── IDE
        ├── Compiler
        └── Tests
```

NavOS does not need to directly edit those files.

This separation is intentional.

---

# Architecture

The experimental architecture looks roughly like this:

```text
                         ┌──────────────────────┐
                         │        Human         │
                         │                      │
                         │ Assigns Commander    │
                         │ Assigns Worker       │
                         └──────────┬───────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │         NavOS          │
                       │                        │
                       │ Universal AI Bridge    │
                       │                        │
                       │ Agent Identity         │
                       │ Project State          │
                       │ Phase State            │
                       │ Messages               │
                       │ Reports                │
                       │ Role Enforcement       │
                       └───────────┬────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
       ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
       │   ChatGPT   │      │   Gemini    │      │   Codex     │
       │     Web     │      │ Antigravity │      │  Desktop    │
       │             │      │    IDE      │      │             │
       └─────────────┘      └─────────────┘      └─────────────┘
              │                    │                    │
              │                    │                    │
              ▼                    ▼                    ▼
          Commander              Worker              Agent
                                  │
                                  ▼
                          Native Project Files
```

The exact communication architecture is still under evaluation.

---

# Core Concepts

NavOS is built around several concepts.

## Agent

An AI client connected to NavOS.

Each logical agent has a persistent identity.

---

## Project

A project registered inside NavOS.

A project represents a workspace that agents can coordinate on.

---

## Phase

A project is divided into phases.

For example:

```text
Phase 1
Inventory the project

        ↓

Phase 2
Create README contract

        ↓

Phase 3
Implement validation

        ↓

Phase 4
Create tests

        ↓

Phase 5
Final verification
```

---

## Commander

The AI responsible for coordinating the project.

The Commander decides:

* what should happen
* how the project should be divided
* what phase should run next
* what information the Worker needs
* when a phase is complete

---

## Worker

The AI responsible for performing an assigned phase.

The Worker:

* receives the current phase
* works inside its native environment
* modifies files when required
* runs tests
* reports results
* waits for the next phase

---

# Agent Types

NavOS distinguishes between two major types of agents.

## Native Agent

A native agent has access to an actual local project directory.

Example:

```text
Gemini
Antigravity IDE
C:\Projects\MyProject
```

The directory identifies the environment in which the agent is operating.

Native agents can participate as Workers.

---

## Web Agent

A web agent does not have direct filesystem access to the local project.

Example:

```text
ChatGPT Web
directory = nil
```

A web agent can act as a Commander or coordinator, but cannot directly become a Worker in the local native-workspace model.

---

# Agent Identity

One of the most important parts of NavOS is persistent agent identity.

A temporary MCP transport connection is **not** treated as the permanent identity of an agent.

Instead, NavOS separates:

```text
Transport Session
        ≠
Logical Agent Identity
```

This distinction became necessary because some AI clients maintain persistent MCP connections while others may create new HTTP requests or sessions.

Without persistent identity, one logical AI could appear as:

```text
agent-1
agent-2
agent-3
agent-4
agent-5
...
```

even though it is actually the same AI client.

NavOS therefore treats the logical agent identity as persistent state.

---

# Agent Connection

An agent explicitly connects to NavOS through the connection mechanism.

The agent provides three important pieces of identity information:

### 1. Model

Example:

```text
GPT-5.6 Luna
```

or:

```text
Gemini
```

### 2. Client Location

Example:

```text
ChatGPT Web PC
```

```text
Antigravity IDE
```

```text
Codex Desktop
```

### 3. Directory

Native agents provide their actual working directory.

Example:

```text
C:\Projects\MyProject
```

Web agents use:

```text
nil
```

This distinction allows NavOS to understand the difference between a native workspace agent and a web-based agent.

---

# Commander and Worker

Role assignment is intentionally controlled by the human.

Agents do **not** automatically assign themselves as Commander or Worker.

The intended workflow is:

```text
Human
  │
  ├── Connect Agent A
  ├── Connect Agent B
  │
  ▼
NavOS Dashboard
  │
  ├── Select Commander
  └── Select Worker
```

This prevents an agent from deciding its own authority within a project.

---

# Project System

Projects are registered with NavOS.

A project can contain:

* project metadata
* registered agents
* Commander
* Worker
* phases
* reports
* communication
* current state

The actual project files remain in the native agent's workspace.

NavOS stores coordination information rather than becoming the project's filesystem.

---

# Phase-Based Workflow

The project workflow is based on phases.

A Commander can create phases such as:

```text
Phase 1
Project inventory

Phase 2
Documentation

Phase 3
Implementation

Phase 4
Testing

Phase 5
Final verification
```

Each phase has a lifecycle.

Conceptually:

```text
Pending
   │
   ▼
Active
   │
   ▼
Completed
```

The Worker works on the active phase and submits a report when finished.

---

# Autonomous Workflow

One of the most important experiments performed with NavOS was an autonomous Commander → Worker workflow.

The intended workflow is:

```text
Human
 │
 │ Initial instruction
 ▼
Commander
 │
 │ Creates phases
 ▼
NavOS
 │
 │ Phase 1
 ▼
Worker
 │
 │ Performs work
 │
 │ Submits report
 ▼
NavOS
 │
 │ Advances phase
 ▼
Worker
 │
 │ Receives next phase
 │
 │ Performs work
 ▼
...
```

The human does not need to manually relay each phase.

---

# Example Workflow

A simplified project might look like this:

### Initial instruction

```text
Complete this project with the Worker.
```

The Commander examines the project and creates:

```text
Phase 1:
Inventory existing files

Phase 2:
Document configuration requirements

Phase 3:
Implement configuration validation

Phase 4:
Create automated tests

Phase 5:
Perform final verification
```

The Worker then executes the phases.

Example:

```text
Commander
    │
    │ Phase 1
    ▼
Worker
    │
    │ Inventory complete
    ▼
Report
    │
    ▼
NavOS
    │
    │ Phase 2
    ▼
Worker
    │
    │ Documentation complete
    ▼
Report
    │
    ▼
NavOS
    │
    │ Phase 3
    ▼
...
```

---

# Autonomous Wake-Up Experiments

Different AI clients behave differently when they are waiting.

During development, NavOS experiments investigated how native AI environments react to background tasks, scheduled execution, MCP notifications, and heartbeat-style execution.

A key discovery was:

> An MCP notification alone does not necessarily cause an idle AI model to start a new reasoning turn.

However, some environments can react to completion of a background task.

For example, Antigravity was tested with a background process that waited and then completed.

The completion caused the AI environment to resume.

Codex was found to behave differently, with heartbeat/scheduled execution providing a mechanism for starting a new reasoning turn.

ChatGPT Web was also tested with scheduled execution.

These experiments demonstrated that autonomous multi-agent workflows depend not only on the server protocol but also on the behavior of each AI client.

---

# MCP Communication

NavOS currently exposes its coordination functionality through the Model Context Protocol (MCP).

MCP allows compatible AI clients to discover and call tools exposed by NavOS.

Conceptually:

```text
AI Client
    │
    │ MCP
    ▼
NavOS MCP Server
    │
    ├── Agent management
    ├── Project management
    ├── Phase management
    ├── Messaging
    └── Coordination
```

---

# Why MCP Was Used

MCP was useful because modern AI clients increasingly support MCP servers.

This makes it possible to expose NavOS functionality without building a completely custom integration for every AI client.

Instead of:

```text
ChatGPT integration
Gemini integration
Codex integration
IDE integration
...
```

the experiment can expose a common MCP interface.

---

# Important MCP Limitation

One of the most important findings from the project is that:

**MCP is not inherently a complete agent-to-agent communication protocol.**

MCP primarily provides a mechanism for an AI client to communicate with a server and use tools/resources exposed by that server.

The desired NavOS architecture is more ambitious:

```text
Agent A
   │
   │
   ▼
Agent B
```

with autonomous agent interoperability.

That raises additional questions around:

* agent identity
* agent discovery
* task delegation
* message delivery
* agent capabilities
* agent lifecycle
* asynchronous communication
* task state
* authentication
* authorization
* agent-to-agent responses
* wake-up behavior

These are broader than simply exposing tools through MCP.

This discovery is one of the reasons the project is currently paused while the long-term architecture is evaluated.

---

# Session and Identity Design

NavOS had to solve a subtle problem:

```text
MCP transport session
```

and:

```text
logical AI agent
```

are not necessarily the same thing.

A persistent SSE client may maintain one transport session for a long time.

A stateless HTTP client may create a new transport session for every request.

Therefore:

```text
Transport Session
```

must be treated as temporary.

While:

```text
Logical Agent
```

must persist.

The database therefore stores logical agent information independently from temporary transport state.

---

# Stateless Client Handling

Stateless clients introduced an additional challenge.

A client may successfully connect once and then make a later request using a new HTTP transport.

NavOS therefore needs to re-establish the logical agent context for subsequent requests.

The architecture was designed around persistent `agent_id` information rather than assuming that a transport session will always survive.

This was extensively tested during development.

---

# Native Agent Separation

Native agents cannot simply be identified by:

```text
model
+
location
+
directory
```

and automatically merged.

Two independent AI agents may intentionally operate in the same directory.

For example:

```text
Gemini
Antigravity IDE
C:\Projects\Test
```

and:

```text
Another Agent
Another Client
C:\Projects\Test
```

may both legitimately exist.

Therefore, native agent identities remain separate logical entities.

---

# Web Agent Identity

Web agents have no local project directory.

They therefore use:

```text
directory = nil
```

For the experimental architecture, web agent identity can use model/client-location information for deterministic recovery.

This is intentionally different from native agents because multiple native agents may share a filesystem directory.

---

# Database

NavOS uses SQLite for persistent coordination state.

The database stores information such as:

* agents
* projects
* project membership
* roles
* phases
* reports
* messages
* lifecycle information

The database is a backend implementation detail.

It is not intended to become the user's primary interaction interface.

The dashboard communicates with NavOS rather than requiring direct database interaction.

---

# Dashboard

NavOS includes a web dashboard for human oversight and assignment.

The dashboard is intentionally minimal and focused on orchestration.

The design includes:

## Status

Displays:

* NavOS status
* uptime
* connected agent count
* project count

---

## Connected Agents

Shows agents that have explicitly connected.

Example:

```text
Connected Agents

GPT-5.6 Luna
ChatGPT Web PC
WEB

Gemini
Antigravity IDE
NATIVE

Codex
Codex Desktop
NATIVE
```

---

## Command Route

The human can assign:

```text
Commander → Worker
```

The dashboard provides explicit Commander and Worker selection.

This is intentionally human-controlled.

---

## Running Projects

Projects are displayed with a compact view of current activity.

The dashboard does not attempt to replace the agents' native development environments.

---

# Security

Security was a major part of the public-release audit.

The project was reviewed for:

* hardcoded secrets
* API keys
* tokens
* passwords
* private keys
* filesystem path leaks
* SQL injection
* command injection
* role bypasses
* unsafe network binding
* sensitive local data
* accidental database commits

The audit found no embedded secrets.

---

# Local Network Binding

The server defaults to:

```text
127.0.0.1
```

rather than binding to all network interfaces.

This is important because NavOS is designed as a local-first system.

The server can therefore remain local unless the user intentionally exposes it through another mechanism.

---

# SQL Safety

Database operations use parameterized SQL queries rather than constructing SQL statements directly from user-controlled values.

This reduces the risk of SQL injection.

---

# Command Execution Safety

Where external processes are executed, argument arrays are used rather than constructing shell commands from untrusted strings.

The implementation uses process execution with explicit argument separation.

---

# Role Enforcement

Project roles are enforced server-side.

The client UI is not treated as the security boundary.

For example, simply changing a dashboard selection or sending a crafted request should not grant an agent Commander or Worker permissions.

NavOS checks the authenticated logical agent and its project role.

---

# Privacy

NavOS is designed to operate locally.

Local runtime information such as:

* database contents
* local agent state
* local project paths
* temporary runtime state

should not be committed to the public repository.

The public-release audit specifically checked for personal filesystem paths and local runtime data.

---

# Git Repository Privacy

The project was audited before public release.

The audit checked for:

* personal filesystem paths
* OneDrive paths
* usernames
* API keys
* authentication tokens
* passwords
* private keys
* bearer tokens
* JWTs
* webhook URLs
* local databases

The repository was cleaned so local runtime data and configuration are ignored.

---

# `.gitignore`

Runtime and local-only data is excluded from the repository.

Examples include:

```text
config/config.json
data/*
scratch/
coverage/
.nyc_output/
.temp/
```

while appropriate example/configuration files remain available for users.

---

# Testing

NavOS has been heavily tested during development.

The final public-release verification included:

```text
74 / 74 JavaScript / TypeScript tests passed
```

Additional Python project tests passed:

```text
9 / 9
11 / 11
```

The test suites covered areas including:

* dashboard redesign
* identity lifecycle
* session lifecycle
* reconnect behavior
* stateless clients
* ChatGPT simulation
* Codex simulation
* Antigravity behavior
* role isolation
* native agent separation
* stale session handling
* project filtering
* agent deletion
* lifecycle hardening

# Tested AI Clients & Autonomous Loop Experiments

A major part of the NavOS development process was testing whether different AI clients could remain in an autonomous Commander → Worker workflow without requiring the human to manually press "Continue" or send every next instruction.

The experiments revealed that different AI clients behave very differently when they are idle.

NavOS itself can track that a new phase is ready, but the AI client must have some mechanism that causes it to start or resume a reasoning turn.

The following clients were tested.

---

## Antigravity IDE / Gemini

**Role tested:** Worker

**Environment:** Antigravity IDE

**Result:** ✅ Successfully tested

Antigravity was the most successful environment for the autonomous Worker loop.

### How the loop worked

Antigravity supports background tasks.

A background watcher process was used to wait for changes in NavOS project state.

The general workflow was:
```text
Antigravity Worker
        │
        │ Wait for next phase
        ▼
Background Watcher
        │
        │ Poll NavOS
        ▼
Phase becomes available
        │
        ▼
Watcher exits
        │
        ▼
Background task completes
        │
        ▼
Antigravity wakes/resumes
        │
        ▼
Gemini continues reasoning
        │
        ▼
Worker executes phase
```
The important discovery was that completion of a background task can wake/resume Antigravity's AI workflow.

This made it possible to build a practical waiting mechanism around NavOS.

Experiments

A simple delayed background task was tested using a command equivalent to:

Wait 10 seconds
→ complete task
→ output wake-up marker

Antigravity resumed automatically when the background task completed.

A longer one-shot delay was also tested.

The same mechanism successfully allowed Antigravity to remain waiting for NavOS and resume when the required condition occurred.

MCP notification behavior

MCP notifications by themselves were also investigated.

Notifications such as:

notifications/message
progress
resource updates
tools/list changes

do not automatically cause an idle Gemini/Antigravity model to begin a new reasoning turn.

Therefore:

MCP notification
      ≠
AI wake-up

The practical solution was to use a background task whose completion causes the Antigravity environment to resume the model.

Result

Antigravity successfully acted as the NavOS Worker in the full autonomous project test.

---

## Codex Desktop

Role tested: Commander

Environment: Codex Desktop

Result: ✅ Successfully tested

Codex was successfully used as the Commander in the autonomous multi-phase workflow.

However, Codex behaves differently from Antigravity.

Background process behavior

A detached/local background process can continue running while Codex is idle.

However:

Background process finishes
        ≠
Codex automatically starts a new reasoning turn

Therefore, simply running a watcher process was not sufficient to wake Codex.

Heartbeat / Scheduled Execution

Codex's heartbeat/scheduled execution mechanism was tested successfully.

The workflow was:

```text
Codex
 │
 │ Creates/starts workflow
 ▼
NavOS
 │
 │ Worker performs phase
 ▼
NavOS state changes
 │
 │
 ▼
Codex heartbeat
 │
 │ Starts a fresh reasoning turn
 ▼
Codex checks NavOS
 │
 ▼
Codex continues workflow
```
A one-time heartbeat test successfully caused Codex to wake and execute a new reasoning turn without a manual user message.

The test produced the expected wake-up output:

NAVOS_CODEX_HEARTBEAT_WAKE_TEST
Result

Codex successfully operated as the Commander in the full autonomous test.

---
## ChatGPT Web

Role tested: Commander / Coordinator

Environment: ChatGPT Web

Result: ✅ Wake-up mechanism tested

ChatGPT Web was tested using scheduled/heartbeat-style execution.

The important difference is that a scheduled ChatGPT execution does not necessarily continue inside the exact same conversation turn.

Instead, it can start a new ChatGPT turn/context.

The tested workflow was:
```text
ChatGPT
 │
 │ Initial turn
 ▼
NavOS
 │
 │ Wait
 ▼
Scheduled execution
 │
 ▼
New ChatGPT turn
 │
 ▼
Reconnect to NavOS
 │
 ▼
Check persistent NavOS state
 │
 ▼
Continue coordination
```

A heartbeat test successfully woke ChatGPT and caused it to reconnect to NavOS.

The resulting test confirmed:

NavOS Universal AI Bridge: ONLINE
Active connections: 3
Registered projects: 1
ChatGPT agent: CONNECTED

This demonstrated that ChatGPT can be used with an external persistent coordination layer even though the scheduled execution may occur in a new chat/turn context.

Important limitation

ChatGPT Web does not behave like a persistent native IDE process.

A scheduled wake-up should therefore be treated as:

New reasoning turn
+
Persistent external NavOS state

rather than:

Same conversation continuously running

This means NavOS must keep enough persistent state for the AI to reconstruct what is happening when it wakes.

Cross-Client Wake-Up Comparison

The experiments showed three different behaviors.

AI Client	Tested Role	Wake Mechanism	Result
Antigravity / Gemini	Worker	Background task completion	✅ Successful
Codex Desktop	Commander	Heartbeat / scheduled execution	✅ Successful
ChatGPT Web	Commander / Coordinator	Scheduled execution / heartbeat-style wake	✅ Successful

The mechanisms can be summarized as:

┌─────────────────────┬──────────────────────────────┐
│ AI Client           │ Wake Mechanism               │
├─────────────────────┼──────────────────────────────┤
│ Antigravity/Gemini  │ Background task completion   │
│ Codex Desktop       │ Heartbeat / scheduled turn   │
│ ChatGPT Web         │ Scheduled new turn           │
└─────────────────────┴──────────────────────────────┘
What Did NOT Work

One of the most important findings was that NavOS cannot assume that sending an MCP notification will wake an idle AI model.

The following general assumption was tested and found to be unreliable:
```text
NavOS
  │
  │ MCP notification
  ▼
Idle AI
  │
  └── Automatically starts thinking

Instead, the observed behavior was:

NavOS
  │
  │ MCP notification
  ▼
AI client
  │
  └── Notification may be received,
      but idle model does not necessarily wake
```
Therefore, the autonomous loop depends on both sides:

NavOS must maintain persistent project/phase state.
The AI client must provide some mechanism capable of starting/resuming execution.
Full Autonomous 5-Phase Test
```text
The most important end-to-end experiment used:

Commander:
Codex Desktop

Worker:
Gemini / Antigravity IDE

The project was divided into five phases.

Phase 1
Baseline project inventory

        ↓

Phase 2
README contract

        ↓

Phase 3
Configuration validation

        ↓

Phase 4
Automated testing

        ↓

Phase 5
Final verification
```
The Worker executed the phases inside its native project environment while the Commander coordinated the workflow.

The test completed all five phases autonomously.

The final test result included:

11 / 11 tests passed

The original project files were preserved during the experiment, including the baseline configuration and test files.

This was the first major proof that the NavOS Commander → Worker concept could operate across two different AI environments without requiring the human to manually relay every phase.

What These Experiments Proved

The experiments demonstrated several important points.

1. AI agents can participate in an external persistent workflow

An AI does not need to store the entire project workflow inside its own conversation.

NavOS can maintain:

Agent
Project
Role
Phase
Report
Message
State

outside the AI conversation.

2. Different AI clients require different wake strategies

There is no universal "wake the AI" mechanism.

Instead:

Antigravity → background task completion

Codex       → heartbeat / scheduled execution

ChatGPT     → scheduled new turn
3. Persistent external state is extremely important

Because some clients may start a completely new reasoning turn, NavOS needs to remain the source of truth for project coordination.

Conceptually:

AI memory
    +
NavOS persistent state
    =
Recoverable workflow
4. MCP alone does not solve autonomous execution

MCP can provide the communication interface, but it does not guarantee that an idle AI client will spontaneously begin another reasoning cycle.

This became one of the major architectural discoveries of the project.

Experimental Conclusion

The experiments demonstrated that autonomous multi-agent workflows are technically possible, but the implementation depends heavily on the execution model of each AI client.

The most successful tested combination was:

Codex Desktop
     │
     │ Commander
     ▼
   NavOS
     │
     │ Phase coordination
     ▼
Antigravity / Gemini
     │
     │ Worker
     ▼
Native Project

The experiment successfully completed a five-phase development workflow with no manual phase-by-phase message relay.

However, these experiments also revealed that the communication protocol and AI wake-up mechanism are separate problems.

NavOS can know that work is ready.

The remaining question is how the target AI agent should reliably receive that state change and begin its next reasoning cycle.

This distinction is one of the primary reasons the project's next-generation architecture is being evaluated before further development continues.


### The important part

I'd **definitely keep this section in the public README**. It's actually one of the strongest parts of the project story.

The really interesting result isn't just *"I connected Gemini, Codex and ChatGPT."*

It's this:

```text
             NavOS State
                  │
                  ▼
        ┌──────────────────┐
        │  Phase Available │
        └────────┬─────────┘
                 │
        ┌────────┼─────────┐
        ▼        ▼         ▼
     Agy       Codex     ChatGPT
      │          │          │
 Background   Heartbeat   Scheduled
 completion   /schedule   new turn
      │          │          │
      ▼          ▼          ▼
    Wakes      Wakes      Wakes

Same NavOS state → completely different wake mechanisms depending on the AI client.

---

# Build Verification

The project also passed the build verification step.

npm run build

```

completed successfully during the public-release audit.

---

# Project Structure

The project is organized roughly around the following areas:

```text
NavOS - Universal Bridge MPC/
│
├── src/
│   ├── db.ts
│   ├── index.ts
│   ├── mcp.ts
│   ├── sessions.ts
│   │
│   └── tools/
│       ├── identity.ts
│       ├── orchestration.ts
│       └── git.ts
│
├── config/
│   └── config.example.json
│
├── data/
│   └── .gitkeep
│
├── test-project/
│
├── tests/
│
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

The exact file structure may evolve as the architecture changes.

---

# Requirements

Typical requirements include:

* Windows / compatible development environment
* Node.js
* npm
* SQLite support
* An MCP-compatible AI client

Optional:

* Antigravity IDE
* Codex
* ChatGPT
* Gemini
* Secure MCP Tunnel

---

# Installation

Clone the repository:

```bash
git clone <repository-url>
cd "NavOS - Universal Bridge MPC"
```

Install dependencies:

```bash
npm install
```

---

# Configuration

Create a local configuration based on the example configuration.

```text
config/config.example.json
```

Copy it to:

```text
config/config.json
```

The local configuration file is intentionally ignored by Git.

Do not commit personal credentials, tokens, private keys, or local environment-specific secrets.

---

# Running NavOS

Start the development server using the project's configured npm scripts.

For example:

```bash
npm run dev
```

The local dashboard is served by the NavOS server.

The MCP endpoint is available locally according to the configured server settings.

The default local binding is:

```text
127.0.0.1
```

---

# Connecting an Agent

A compatible AI client connects to NavOS through MCP.

The intended workflow is:

```text
1. Start NavOS

2. Open the AI client

3. Connect the client to NavOS

4. Explicitly call the connection mechanism

5. Provide:
   - model
   - client location
   - directory

6. NavOS establishes the logical agent identity
```

Only after explicit connection should the agent appear as connected.

---

# Native Agent Example

A native agent might identify itself as:

```text
Model:
Gemini

Client:
Antigravity IDE

Directory:
C:\Projects\MyProject
```

NavOS then knows:

```text
Type:
NATIVE
```

and associates the agent with its workspace.

---

# Web Agent Example

A web agent might identify itself as:

```text
Model:
GPT-5.6 Luna

Client:
ChatGPT Web PC

Directory:
nil
```

NavOS recognizes:

```text
Type:
WEB
```

---

# Registering a Project

A native agent can register its project with NavOS.

The project registration associates the logical project with the native workspace.

Conceptually:

```text
Agent
  │
  │ register_project
  ▼
NavOS
  │
  ▼
Project
```

Project membership is tracked separately from the agent's global identity.

---

# Commander / Worker Workflow

Once agents and a project exist:

```text
Human
 │
 ├── Select Commander
 │
 └── Select Worker
 │
 ▼
NavOS
 │
 ▼
Commander
 │
 ├── Analyze project
 ├── Create phases
 └── Coordinate Worker
       │
       ▼
     Worker
       │
       ├── Execute phase
       ├── Modify files
       ├── Run tests
       └── Submit report
              │
              ▼
            NavOS
              │
              ▼
        Next phase
```

---

# Agent Communication

NavOS includes communication primitives intended for coordination between agents.

Examples include:

```text
send_agent_message
```

and project/phase reporting mechanisms.

The exact tool names and schemas may evolve while the long-term communication architecture is being evaluated.

---

# Phase Reports

Workers can submit reports after completing phases.

A report can contain information such as:

* work performed
* files changed
* tests executed
* results
* problems encountered
* remaining work

The Commander can use the report to determine what should happen next.

---

# Human Intervention

The goal is not to eliminate the human completely.

The intended model is:

```text
Normal work
    ↓
Agents coordinate autonomously
    ↓
Human stays out of the loop
```

But:

```text
Ambiguity
    ↓
Agent requests clarification
    ↓
Human responds
    ↓
Work continues
```

This makes the human a supervisor rather than a message relay.

---

# Remote Access

NavOS is designed to be local-first.

When a remote AI client needs to access a locally running NavOS instance, a secure tunneling mechanism can be used instead of directly exposing the local server to the public Internet.

During development, OpenAI Secure MCP Tunnel was used to connect ChatGPT Web to the local MCP server.

Conceptually:

```text
ChatGPT Web
     │
     │ Secure MCP Tunnel
     ▼
Local NavOS
     │
     ▼
127.0.0.1:3020
```

The tunnel is external infrastructure and is not the core NavOS architecture.

---

# Development

Clone the repository and install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Development should preserve the following principles:

1. Do not move native file operations into NavOS unnecessarily.
2. Do not treat MCP transport sessions as permanent agent identities.
3. Do not allow agents to self-assign project roles.
4. Do not merge independent native agents simply because they share a directory.
5. Keep authentication and authorization server-side.
6. Keep local runtime data out of Git.
7. Avoid unnecessary external dependencies.

---

# Testing Commands

The primary JavaScript / TypeScript test suite can be run with:

```bash
npm test
```

Build verification:

```bash
npm run build
```

The experimental test project also contains Python validation tests.

---

# Design Decisions

## Local First

NavOS was designed around local operation.

The system should not require a cloud backend simply to coordinate agents operating on a local machine.

---

## Persistent Logical Identity

A temporary network connection is not an agent.

The logical AI identity must survive transport reconnections.

---

## Human-Controlled Roles

Agents do not decide their own authority.

The human assigns:

```text
Commander
Worker
```

through the orchestration layer.

---

## Native Workspace Ownership

A native agent works in its own environment.

NavOS should not become a remote filesystem editor simply to coordinate the agent.

---

## Coordination Over Execution

NavOS coordinates work.

The AI agents execute the actual work.

This keeps the bridge lightweight and avoids turning NavOS into another IDE or remote execution framework.

---

# What NavOS Does Not Do

NavOS is **not** intended to be:

* an AI model
* an LLM
* an IDE
* a replacement for Git
* a remote desktop
* a filesystem management service
* a cloud coding environment
* a model hosting platform
* a general-purpose operating system
* a replacement for MCP
* currently a finalized A2A implementation

The name "NavOS" refers to the project's orchestration/coordination concept rather than an operating system kernel.

---

# Known Limitations

## 1. MCP Is Not Full Agent-to-Agent Communication

The biggest architectural limitation discovered during development is that MCP alone does not fully solve autonomous agent-to-agent interoperability.

Further architecture research is required.

---

## 2. AI Client Behavior Differs

Different AI clients handle:

* MCP sessions
* background tasks
* notifications
* scheduled execution
* heartbeats
* reconnects
* idle states

differently.

Therefore, an autonomous workflow cannot assume identical behavior across all AI clients.

---

## 3. Web AI Clients May Be Stateless

Web-based AI clients may create new transport sessions between turns.

Persistent logical identity therefore requires external state and explicit identity handling.

---

## 4. Autonomous Wake-Up Is Client Dependent

A server can know that a phase is ready.

That does not automatically mean an idle AI client will wake up.

The client must provide an appropriate mechanism such as:

* background task completion
* heartbeat
* scheduled execution
* persistent active turn
* another supported wake mechanism

---

## 5. Architecture Is Still Experimental

The project demonstrated that a multi-agent workflow can be built around the current design, but the long-term protocol and communication architecture remain open questions.

---

# Future Direction

The next stage of NavOS depends heavily on solving the agent-to-agent communication problem correctly.

Possible directions include:

```text
MCP
 +
A2A
```

or another dedicated communication layer.

A potential future architecture could look like:

```text
                  ┌──────────────┐
                  │    Human     │
                  └──────┬───────┘
                         │
                         ▼
                ┌─────────────────┐
                │      NavOS      │
                │  Orchestrator   │
                └────────┬────────┘
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
        ┌──────────┐           ┌──────────┐
        │ Agent A  │◄─────────►│ Agent B  │
        └──────────┘           └──────────┘
             │                       │
             ▼                       ▼
          Tools                   Tools
          Files                   IDE
          Git                     Terminal
```

The exact protocol has intentionally not been finalized.

---

# Roadmap

## Completed

* [x] Local NavOS server
* [x] SQLite backend
* [x] MCP integration
* [x] Agent registration
* [x] Persistent logical agent identity
* [x] Native/Web agent distinction
* [x] Project registration
* [x] Project membership
* [x] Commander / Worker model
* [x] Phase-based workflow
* [x] Phase reporting
* [x] Agent messaging
* [x] Role enforcement
* [x] Dashboard
* [x] Stateless session handling experiments
* [x] SSE lifecycle handling
* [x] Reconnect handling
* [x] Agent deletion handling
* [x] Autonomous wake-up experiments
* [x] Public-release security audit
* [x] Secret scan
* [x] Privacy scan
* [x] Build verification
* [x] Automated regression testing

---

## Currently Paused

* [ ] Final autonomous multi-agent protocol
* [ ] Long-term agent-to-agent communication architecture
* [ ] MCP + A2A integration decision
* [ ] Production architecture
* [ ] Large-scale multi-agent deployment

---

# Contributing

Contributions, experiments, architecture discussions, and protocol ideas are welcome.

Because the project is currently in an experimental stage, architectural discussions are especially valuable.

If you want to contribute, consider focusing on:

* agent communication protocols
* MCP interoperability
* A2A interoperability
* asynchronous agent communication
* persistent agent identity
* agent discovery
* autonomous workflow design
* security
* authentication
* authorization
* lifecycle management

Before making major architectural changes, please open an issue or discussion so the design can be evaluated first.

---

# Philosophy

NavOS was built around a simple question:

> **What happens when AI agents stop working alone and start working together?**

The interesting part isn't simply making another AI tool.

The interesting part is creating the infrastructure that allows different AI systems to cooperate while keeping their own capabilities and environments.

The ideal workflow looks something like:

```text
Human
  │
  │ "Complete this project."
  ▼
Commander
  │
  │ Plans
  ▼
NavOS
  │
  │ Delegates
  ▼
Worker
  │
  │ Builds
  ▼
NavOS
  │
  │ Reports
  ▼
Commander
  │
  │ Reviews
  ▼
Worker
  │
  │ Continues
  ▼
Completed Project
```

The human should not have to be the network cable between every AI.

---

# Credits

NavOS was developed as an independent experimental project exploring:

* Multi-agent AI systems
* MCP
* AI orchestration
* Autonomous workflows
* Local-first AI infrastructure
* IDE-based AI agents
* Persistent agent identity
* Human-supervised agent collaboration

---

# Disclaimer

NavOS is an experimental research project.

It should not be considered production-ready infrastructure for security-critical, safety-critical, financial, or otherwise high-risk workloads without independent security review and appropriate hardening.

AI client behavior may change independently of NavOS.

Protocol support may also change as MCP, A2A, AI clients, and agent frameworks continue to evolve.

---

# License

See the repository license file for the terms governing use and distribution.

---

## NavOS

**Universal AI Bridge**

```text
Connect.
Coordinate.
Collaborate.
```

