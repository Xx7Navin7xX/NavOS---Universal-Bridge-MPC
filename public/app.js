// ============================================================================
// NAVOS - AI BRIDGE | Prototype 1 Dashboard & Landing Page Client
// ============================================================================

(function () {
  'use strict';

  // State
  const state = {
    agents: [],
    projects: [],
    serverUp: false,
    uptimeSeconds: 0
  };

  // DOM Elements
  const el = {
    landingView: document.getElementById('landing-view'),
    dashboardView: document.getElementById('dashboard-view'),
    matrixCanvasLanding: document.getElementById('matrix-canvas-landing'),
    matrixCanvasDash: document.getElementById('matrix-canvas-dash'),
    dashHomeBtn: document.getElementById('dash-home-btn'),

    serverStatusDot: document.getElementById('server-status-dot'),
    serverUptimeDisplay: document.getElementById('server-uptime-display'),
    statConnectedAgents: document.getElementById('stat-connected-agents'),
    statProjectsCount: document.getElementById('stat-projects-count'),

    connectedAgentsList: document.getElementById('connected-agents-list'),
    runningProjectsList: document.getElementById('running-projects-list')
  };

  // --------------------------------------------------------------------------
  // Matrix Digital Rain Engine (Dynamic Empty Screen Area Scanner)
  // --------------------------------------------------------------------------
  const MATRIX_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    '日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ' +
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
    '+=-*#@$%&<>[]{}';

  const matrixState = {
    animId: null,
    running: false,
    fontSize: 14,
    columns: [],
    lastFrameTime: 0
  };

  function getScreenBounds() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const imgAspect = 1536 / 1024; // 1.5
    const screenAspect = W / H;

    let imgLeft, imgRight, imgTop, imgBottom;

    if (screenAspect >= imgAspect) {
      // Screen is wider than 3:2 (standard 16:9, 16:10, 21:9 ultrawide)
      // Empty black spaces are on the left and right sides
      const renderW = H * imgAspect;
      imgLeft = (W - renderW) / 2;
      imgRight = imgLeft + renderW;
      imgTop = 0;
      imgBottom = H;
    } else {
      // Screen is taller than 3:2 (portrait, 4:3, 5:4)
      // Empty black spaces are on the top and bottom
      const renderH = W / imgAspect;
      imgLeft = 0;
      imgRight = W;
      imgTop = (H - renderH) / 2;
      imgBottom = imgTop + renderH;
    }

    return { W, H, imgLeft, imgRight, imgTop, imgBottom, screenAspect, imgAspect };
  }

  function setupLandingMatrixCanvas() {
    const canvas = el.matrixCanvasLanding;
    if (!canvas) return;

    const { W, H, imgLeft, imgRight, screenAspect, imgAspect } = getScreenBounds();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = matrixState.fontSize;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const numCols = Math.ceil(W / fontSize);
    matrixState.columns = [];
    for (let i = 0; i < numCols; i++) {
      const x = i * fontSize;
      let inEmpty = false;
      if (screenAspect >= imgAspect) {
        // Empty on left and right outside the 3:2 poster
        inEmpty = (x < imgLeft || x > imgRight);
      } else {
        // Empty on top and bottom
        inEmpty = true;
      }

      matrixState.columns.push({
        x,
        y: Math.random() * -H,
        speed: 0.8 + Math.random() * 1.5,
        inEmpty
      });
    }
  }

  function startMatrixRain() {
    if (matrixState.running) return;
    matrixState.running = true;
    matrixState.lastFrameTime = performance.now();

    function renderLoop(time) {
      if (!matrixState.running) return;

      // Throttle to ~30-40fps for authentic retro phosphor look & low CPU overhead
      if (time - matrixState.lastFrameTime >= 28) {
        matrixState.lastFrameTime = time;
        drawMatrixFrame();
      }

      matrixState.animId = requestAnimationFrame(renderLoop);
    }

    matrixState.animId = requestAnimationFrame(renderLoop);
  }

  function pauseMatrixRain() {
    matrixState.running = false;
    if (matrixState.animId) {
      cancelAnimationFrame(matrixState.animId);
      matrixState.animId = null;
    }
  }

  function resumeMatrixRain() {
    if (!matrixState.running) {
      startMatrixRain();
    }
  }

  function drawMatrixFrame() {
    const canvas = el.matrixCanvasLanding;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { W, H, imgTop, imgBottom, screenAspect, imgAspect } = getScreenBounds();
    const fontSize = matrixState.fontSize;

    // Fading trails: transparent black veil over previous frame
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = `${fontSize}px 'Consolas', 'JetBrains Mono', monospace`;

    for (let col of matrixState.columns) {
      if (!col.inEmpty) continue;

      if (screenAspect < imgAspect && col.y >= imgTop && col.y <= imgBottom) {
        col.y += fontSize * col.speed;
        continue;
      }

      const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];

      // Glowing white leading character
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(char, col.x, col.y);

      // Trailing faint white character
      if (col.y - fontSize > 0) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(210, 210, 210, 0.65)';
        const trailChar = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        ctx.fillText(trailChar, col.x, col.y - fontSize);
      }

      col.y += fontSize * col.speed;

      if (col.y > H + 50 && Math.random() > 0.95) {
        col.y = Math.random() * -80;
        col.speed = 0.8 + Math.random() * 1.5;
      }
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // Dashboard Matrix Rain Engine (Full-screen background behind dashboard)
  // --------------------------------------------------------------------------
  const matrixDashState = {
    columns: [],
    fontSize: 14,
    animId: null,
    running: false,
    lastFrameTime: 0
  };

  function setupDashMatrixCanvas() {
    const canvas = el.matrixCanvasDash;
    if (!canvas) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = matrixDashState.fontSize;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const numCols = Math.ceil(W / fontSize);
    matrixDashState.columns = [];
    for (let i = 0; i < numCols; i++) {
      matrixDashState.columns.push({
        x: i * fontSize,
        y: Math.random() * -H,
        speed: 0.7 + Math.random() * 1.3
      });
    }
  }

  function startDashMatrixRain() {
    if (matrixDashState.running) return;
    matrixDashState.running = true;
    matrixDashState.lastFrameTime = performance.now();

    function renderLoop(time) {
      if (!matrixDashState.running) return;

      if (time - matrixDashState.lastFrameTime >= 28) {
        matrixDashState.lastFrameTime = time;
        drawDashMatrixFrame();
      }

      matrixDashState.animId = requestAnimationFrame(renderLoop);
    }

    matrixDashState.animId = requestAnimationFrame(renderLoop);
  }

  function pauseDashMatrixRain() {
    matrixDashState.running = false;
    if (matrixDashState.animId) {
      cancelAnimationFrame(matrixDashState.animId);
      matrixDashState.animId = null;
    }
  }

  function drawDashMatrixFrame() {
    const canvas = el.matrixCanvasDash;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const fontSize = matrixDashState.fontSize;

    // Fading trails: semi-transparent black veil
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = `${fontSize}px 'Consolas', 'JetBrains Mono', monospace`;

    for (let col of matrixDashState.columns) {
      const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];

      // Glowing white leading character
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowBlur = 3;
      ctx.fillText(char, col.x, col.y);

      // Trailing character
      if (col.y - fontSize > 0) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200, 200, 200, 0.55)';
        const trailChar = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        ctx.fillText(trailChar, col.x, col.y - fontSize);
      }

      col.y += fontSize * col.speed;

      if (col.y > H + 40 && Math.random() > 0.96) {
        col.y = Math.random() * -60;
        col.speed = 0.7 + Math.random() * 1.3;
      }
    }

    ctx.restore();
  }

  function initMatrixRain() {
    setupLandingMatrixCanvas();
    setupDashMatrixCanvas();
    window.addEventListener('resize', () => {
      setupLandingMatrixCanvas();
      setupDashMatrixCanvas();
    });
    startMatrixRain();
  }

  // --------------------------------------------------------------------------
  // Navigation & View State (Zoom Open to NavOS & Cyber Reveal)
  // --------------------------------------------------------------------------
  let currentView = 'landing';
  let isTransitioning = false;

  function openDashboard(animated = true) {
    if (currentView === 'dashboard' && !isTransitioning) return;
    currentView = 'dashboard';
    window.location.hash = 'dashboard';
    document.body.classList.add('dashboard-active');

    startDashMatrixRain();

    if (!animated) {
      pauseMatrixRain();
      el.landingView.classList.add('zoom-open');
      el.landingView.style.visibility = 'hidden';
      el.dashboardView.style.display = 'block';
      return;
    }

    isTransitioning = true;
    el.landingView.style.visibility = 'visible';
    el.dashboardView.style.display = 'block';

    // Trigger zoom open focused on NavOS
    requestAnimationFrame(() => {
      el.landingView.classList.add('zoom-open');
    });

    // Complete transition after zoom finishes
    setTimeout(() => {
      isTransitioning = false;
      if (currentView === 'dashboard') {
        el.landingView.style.visibility = 'hidden';
        pauseMatrixRain();
      }
    }, 800);
  }

  function openLanding(animated = true) {
    if (currentView === 'landing' && !isTransitioning) return;
    currentView = 'landing';
    window.location.hash = '';
    document.body.classList.remove('dashboard-active');

    pauseDashMatrixRain();
    resumeMatrixRain();

    if (!animated) {
      el.landingView.classList.remove('zoom-open');
      el.landingView.style.visibility = 'visible';
      el.dashboardView.style.display = 'none';
      return;
    }

    isTransitioning = true;
    el.landingView.style.visibility = 'visible';

    // Trigger zoom back out
    requestAnimationFrame(() => {
      el.landingView.classList.remove('zoom-open');
    });

    // Hide dashboard once zoom fully closes
    setTimeout(() => {
      isTransitioning = false;
      if (currentView === 'landing') {
        el.dashboardView.style.display = 'none';
      }
    }, 800);
  }

  function setView(viewName, animated = true) {
    if (viewName === 'dashboard') {
      openDashboard(animated);
    } else {
      openLanding(animated);
    }
  }

  // Click & Keyboard Enter Listeners
  // Clicking anywhere on the landing view opens the dashboard
  el.landingView.addEventListener('click', (e) => {
    if (currentView === 'landing' && !isTransitioning) {
      openDashboard(true);
    }
  });

  el.dashHomeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openLanding(true);
  });

  // Pressing Enter key opens dashboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // If currently on landing view and not currently transitioning, open dashboard
      if (currentView === 'landing' && !isTransitioning) {
        e.preventDefault();
        openDashboard(true);
      }
    }
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#dashboard') {
      if (currentView !== 'dashboard') openDashboard(true);
    } else {
      if (currentView !== 'landing') openLanding(true);
    }
  });

  // --------------------------------------------------------------------------
  // API Fetch Helpers
  // --------------------------------------------------------------------------
  async function apiGet(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async function apiDelete(url) {
    try {
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`DELETE ${url} failed:`, err);
      return null;
    }
  }

  async function apiPost(url, data) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`POST ${url} failed:`, err);
      return null;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatUptime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // --------------------------------------------------------------------------
  // Heartbeat & Live Uptime
  // --------------------------------------------------------------------------
  async function checkServerStatus() {
    const status = await apiGet('/api/status');
    if (status && status.status === 'online') {
      state.serverUp = true;
      state.uptimeSeconds = status.uptimeSeconds || 0;
      el.serverStatusDot.classList.remove('disconnected');
      el.serverUptimeDisplay.textContent = formatUptime(state.uptimeSeconds);
    } else {
      state.serverUp = false;
      el.serverStatusDot.classList.add('disconnected');
    }
  }

  // Uptime tick: only runs when server is connected
  setInterval(() => {
    if (state.serverUp) {
      state.uptimeSeconds += 1;
      el.serverUptimeDisplay.textContent = formatUptime(state.uptimeSeconds);
    }
  }, 1000);

  // Status check heartbeat every 4 seconds
  setInterval(checkServerStatus, 4000);

  // --------------------------------------------------------------------------
  // Rendering: Connected Agents
  // --------------------------------------------------------------------------
  function getConnectedAgents() {
    return state.agents.filter(a => a.isCurrentlyConnected);
  }

  const expandedAgents = new Set();

  function renderConnectedAgents() {
    const connected = getConnectedAgents();
    el.statConnectedAgents.textContent = connected.length;

    // Show all registered agents, sorting connected/active agents first
    const allAgents = [...state.agents].sort((a, b) => {
      if (a.isCurrentlyConnected && !b.isCurrentlyConnected) return -1;
      if (!a.isCurrentlyConnected && b.isCurrentlyConnected) return 1;
      return (a.id || '').localeCompare(b.id || '');
    });

    if (allAgents.length === 0) {
      el.connectedAgentsList.innerHTML = '<div class="empty-notice">No agents registered</div>';
      return;
    }

    el.connectedAgentsList.innerHTML = allAgents.map(agent => {
      const isConn = !!agent.isCurrentlyConnected;
      const isExpanded = expandedAgents.has(agent.id);
      const modelName = agent.modelName || agent.id;
      const clientLocation = agent.clientLocation || agent.client || agent.clientName || 'Unknown';
      const agentType = agent.agentType || (agent.directory ? 'NATIVE' : 'WEB');
      const directory = agent.directory || null;
      const role = agent.role || 'Unassigned';
      const project = agent.project || 'None';
      const status = agent.status || (isConn ? 'Connected' : 'Disconnected');

      return `
        <div class="agent-card ${isConn ? '' : 'agent-disconnected'} ${isExpanded ? 'expanded' : ''}" data-agent-id="${escapeHtml(agent.id)}" title="Click to view details and options">
          <div class="agent-card-header">
            <span class="agent-dot ${isConn ? 'connected' : 'disconnected'}">${isConn ? '●' : '○'}</span>
            <span class="agent-name">${escapeHtml(modelName)}</span>
            <span class="agent-type-badge ${agentType === 'NATIVE' ? 'badge-native' : 'badge-web'}" style="margin-left:auto; font-size:10px; padding:2px 6px; border:1px solid #444; border-radius:3px; background:#111; color:${agentType === 'NATIVE' ? '#4af626' : '#64b5f6'};">${escapeHtml(agentType)}</span>
          </div>
          <div class="agent-info-row">
            <span class="label">Client:</span>
            <span class="val">${escapeHtml(clientLocation)}</span>
          </div>
          <div class="agent-info-row">
            <span class="label">Status:</span>
            <span class="val" style="color: ${isConn ? '#4af626' : '#888'}; font-weight: 600;">${escapeHtml(status)}</span>
          </div>
          <div class="agent-info-row">
            <span class="label">Type:</span>
            <span class="val">${escapeHtml(agentType)}</span>
          </div>
          ${directory ? `
          <div class="agent-info-row">
            <span class="label">Directory:</span>
            <span class="val dir-val" style="word-break:break-all; font-size:11px;" title="${escapeHtml(directory)}">${escapeHtml(directory)}</span>
          </div>` : ''}
          <div class="agent-info-row">
            <span class="label">Role:</span>
            <span class="val role-tag">${escapeHtml(role)}</span>
          </div>
          <div class="agent-info-row">
            <span class="label">Project:</span>
            <span class="val">${escapeHtml(project)}</span>
          </div>
          ${isExpanded ? `
          <div class="agent-actions-row">
            <button type="button" class="btn-delete-agent" data-agent-id="${escapeHtml(agent.id)}" data-agent-name="${escapeHtml(modelName)}">Delete Agent</button>
          </div>` : ''}
        </div>
      `;
    }).join('');

    // 1. Click agent card to toggle expansion
    el.connectedAgentsList.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) {
          return;
        }
        const agentId = card.getAttribute('data-agent-id');
        if (!agentId) return;

        if (expandedAgents.has(agentId)) {
          expandedAgents.delete(agentId);
        } else {
          expandedAgents.add(agentId);
        }
        renderConnectedAgents();
      });
    });

    // 2. Attach click listeners to Delete Agent buttons
    el.connectedAgentsList.querySelectorAll('.btn-delete-agent').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const agentId = btn.getAttribute('data-agent-id');
        const agentName = btn.getAttribute('data-agent-name') || agentId;
        if (!agentId) return;

        if (!confirm(`Are you sure you want to delete agent "${agentName}" (${agentId})?`)) {
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Deleting...';
        const res = await apiDelete(`/api/agents/${encodeURIComponent(agentId)}`);
        if (res && res.success) {
          expandedAgents.delete(agentId);
          await fetchAllData();
        } else {
          alert(`Failed to delete agent: ${res?.error || 'Unknown error'}`);
          btn.disabled = false;
          btn.textContent = 'Delete Agent';
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Rendering & Actions: Running Projects
  // --------------------------------------------------------------------------
  const expandedProjects = new Set();

  function renderRunningProjects() {
    el.statProjectsCount.textContent = state.projects.length;

    if (state.projects.length === 0) {
      el.runningProjectsList.innerHTML = '<div class="empty-notice">No running projects</div>';
      return;
    }

    const connectedAgents = getConnectedAgents();

    el.runningProjectsList.innerHTML = state.projects.map(proj => {
      const isExpanded = expandedProjects.has(proj.name);
      const statusClass = `status-${proj.workflowState || 'idle'}`;
      const statusText = proj.workflowStateLabel || 'Idle';

      // Commander: WEB or NATIVE eligible
      const commanderOptions = connectedAgents.map(a => {
        const title = `${a.modelName} [${a.clientLocation || a.clientName || 'Client'}]`;
        const sel = a.id === proj.commander ? 'selected' : '';
        return `<option value="${escapeHtml(a.id)}" ${sel}>${escapeHtml(title)}</option>`;
      }).join('');

      // Worker: NATIVE ONLY! WEB agents are never eligible as Worker
      const nativeWorkers = connectedAgents.filter(a => a.agentType === 'NATIVE');
      const workerOptions = nativeWorkers.map(a => {
        const title = `${a.modelName} [${a.clientLocation || a.clientName || 'Client'}]`;
        const sel = a.id === proj.worker ? 'selected' : '';
        return `<option value="${escapeHtml(a.id)}" ${sel}>${escapeHtml(title)}</option>`;
      }).join('');

      const phase = proj.currentPhase;
      const phaseStr = phase
        ? `Phase ${phase.phase_number}${proj.totalPhases ? ' / ' + proj.totalPhases : ''}`
        : 'No active phase';
      const phaseTitle = phase ? phase.title : 'Awaiting Commander instructions';

      const pending = proj.pendingInput;

      return `
        <div class="project-card ${isExpanded ? 'expanded' : ''}" data-project-name="${escapeHtml(proj.name)}">
          <div class="project-header">
            <span class="project-name">${escapeHtml(proj.name)}</span>
            <div class="project-header-right">
              <span class="project-status-dot ${statusClass}">● ${escapeHtml(statusText)}</span>
              <span class="project-expand-icon">${isExpanded ? '▲' : '▼'}</span>
            </div>
          </div>

          <div class="project-phase-box">
            <div class="phase-number-row">
              <span class="phase-badge">${escapeHtml(phaseStr)}</span>
              <span class="phase-title">${escapeHtml(phaseTitle)}</span>
            </div>
            ${phase && phase.objective ? `<div class="phase-objective">${escapeHtml(phase.objective)}</div>` : ''}
          </div>

          <div class="project-expanded-drawer">
            <div class="project-roles-grid">
              <div class="role-selector-group">
                <label>Commander:</label>
                <select class="form-select select-commander" data-project="${escapeHtml(proj.name)}">
                  <option value="">${proj.commander ? escapeHtml(proj.commander) : '-- Select Commander --'}</option>
                  ${commanderOptions}
                </select>
              </div>
              <div class="role-selector-group">
                <label>Worker:</label>
                <select class="form-select select-worker" data-project="${escapeHtml(proj.name)}">
                  <option value="">${proj.worker ? escapeHtml(proj.worker) : '-- Select Worker --'}</option>
                  ${workerOptions}
                </select>
              </div>
            </div>

            <div class="project-actions-row">
              <button type="button" class="btn-delete-project" data-project="${escapeHtml(proj.name)}">Delete Project</button>
            </div>

            ${pending ? `
              <div class="human-input-box">
                <div class="human-input-header">⚠️ HUMAN INPUT REQUIRED (Phase ${escapeHtml(String(pending.phase_number || ''))})</div>
                <div class="human-input-q"><strong>Question:</strong> ${escapeHtml(pending.question)}</div>
                ${pending.reason ? `<div class="human-input-r"><strong>Reason:</strong> ${escapeHtml(pending.reason)}</div>` : ''}
                <div class="human-input-form">
                  <input type="text" class="form-input human-input-field" id="input-response-${pending.id}" placeholder="Type decision/clarification and press Submit...">
                  <button class="btn-primary btn-sm btn-submit-human-input" data-project="${escapeHtml(proj.name)}" data-input-id="${pending.id}">Submit</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    attachProjectEventListeners();
  }

  function attachProjectEventListeners() {
    // 1. Click on project card to toggle expand/collapse (ignoring clicks on controls)
    el.runningProjectsList.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('select') || e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
          return;
        }
        const projName = card.getAttribute('data-project-name');
        if (!projName) return;

        if (expandedProjects.has(projName)) {
          expandedProjects.delete(projName);
          card.classList.remove('expanded');
          const icon = card.querySelector('.project-expand-icon');
          if (icon) icon.textContent = '▼';
        } else {
          expandedProjects.add(projName);
          card.classList.add('expanded');
          const icon = card.querySelector('.project-expand-icon');
          if (icon) icon.textContent = '▲';
        }
      });
    });

    // 2. Commander select
    el.runningProjectsList.querySelectorAll('.select-commander').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const projectName = sel.getAttribute('data-project');
        const commanderId = sel.value;
        if (!commanderId) return;
        sel.disabled = true;
        await apiPost(`/api/projects/${encodeURIComponent(projectName)}/roles`, { commanderId });
        await fetchAllData();
      });
    });

    // 3. Worker select
    el.runningProjectsList.querySelectorAll('.select-worker').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async (e) => {
        e.stopPropagation();
        const projectName = sel.getAttribute('data-project');
        const workerId = sel.value;
        if (!workerId) return;
        sel.disabled = true;
        await apiPost(`/api/projects/${encodeURIComponent(projectName)}/roles`, { workerId });
        await fetchAllData();
      });
    });

    // 4. Delete Project
    el.runningProjectsList.querySelectorAll('.btn-delete-project').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const projectName = btn.getAttribute('data-project');
        if (!projectName) return;

        if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) {
          return;
        }

        btn.disabled = true;
        const res = await apiDelete(`/api/projects/${encodeURIComponent(projectName)}`);
        if (res && res.success) {
          expandedProjects.delete(projectName);
          await fetchAllData();
        } else {
          alert(`Failed to delete project: ${res?.error || 'Unknown error'}`);
          btn.disabled = false;
        }
      });
    });

    // 5. Human Input Submit
    el.runningProjectsList.querySelectorAll('.human-input-form input').forEach(input => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const form = input.closest('.human-input-form');
          const submitBtn = form?.querySelector('.btn-submit-human-input');
          if (submitBtn) submitBtn.click();
        }
      });
    });

    el.runningProjectsList.querySelectorAll('.btn-submit-human-input').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const projectName = btn.getAttribute('data-project');
        const inputId = btn.getAttribute('data-input-id');
        const inputElem = document.getElementById(`input-response-${inputId}`);
        const response = inputElem ? inputElem.value.trim() : '';

        if (!response) {
          alert('Please enter a response for the Commander.');
          return;
        }

        btn.disabled = true;
        const res = await apiPost(`/api/projects/${encodeURIComponent(projectName)}/human-input`, {
          inputId,
          response
        });

        if (res && res.success) {
          await fetchAllData();
        } else {
          alert(`Failed to submit human input: ${res?.error || 'Unknown error'}`);
          btn.disabled = false;
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Data Fetching
  // --------------------------------------------------------------------------
  async function fetchAgents() {
    const agents = await apiGet('/api/agents');
    if (agents) {
      state.agents = agents;
      renderConnectedAgents();
      renderRunningProjects();
    }
  }

  async function fetchProjects() {
    const projects = await apiGet('/api/projects');
    if (projects) {
      state.projects = projects;
      renderRunningProjects();
    }
  }

  async function fetchAllData() {
    await Promise.all([
      checkServerStatus(),
      fetchAgents(),
      fetchProjects()
    ]);
  }

  // --------------------------------------------------------------------------
  // Server-Sent Events (SSE) for Real-Time Sync
  // --------------------------------------------------------------------------
  function initEventStream() {
    try {
      const es = new EventSource('/api/stream');

      es.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.agents) state.agents = data.agents;
          if (data.projects) state.projects = data.projects;
          renderConnectedAgents();
          renderRunningProjects();
        } catch (err) {}
      });

      const refreshEvents = [
        'agent_connected', 'agent_disconnected', 'agent_updated', 'agent_deleted',
        'project_updated', 'project_created', 'project_deleted', 'phase_created',
        'phase_advanced', 'phase_reported', 'human_input_requested', 'human_input_answered'
      ];
      refreshEvents.forEach(evt => {
        es.addEventListener(evt, () => {
          fetchAgents();
          fetchProjects();
        });
      });

      es.onopen = () => {
        state.serverUp = true;
        el.serverStatusDot.classList.remove('disconnected');
      };

      es.onerror = () => {
        checkServerStatus();
      };
    } catch (err) {
      console.warn('SSE initialization error:', err);
    }
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    initMatrixRain();

    // Initial view based on hash (no animation on immediate load)
    if (window.location.hash === '#dashboard') {
      setView('dashboard', false);
    } else {
      setView('landing', false);
    }

    initEventStream();
    fetchAllData();

    // Periodic refresh every 5 seconds for resilience
    setInterval(fetchAllData, 5000);
  });

})();
