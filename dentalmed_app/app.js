const UNITS = [
  { id: 'joao-pessoa', name: 'DentalMed Joao Pessoa', city: 'Joao Pessoa' },
  { id: 'campina-grande', name: 'DentalMed Campina Grande', city: 'Campina Grande' },
  { id: 'recife', name: 'DentalMed Recife', city: 'Recife' },
  { id: 'guarabira', name: 'DentalMed Guarabira', city: 'Guarabira' }
];

const STATUS_LABELS = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluida',
  not_done: 'Nao feita'
};

const app = document.getElementById('app');
const config = window.DENTALMED_CONFIG || {};
const runtimeSupabaseUrl = localStorage.getItem('dentalmedSupabaseUrl') || config.SUPABASE_URL;
const runtimeSupabaseAnonKey = localStorage.getItem('dentalmedSupabaseAnonKey') || config.SUPABASE_ANON_KEY;
const hasSupabase = Boolean(runtimeSupabaseUrl && runtimeSupabaseAnonKey && window.supabase);
const db = hasSupabase ? window.supabase.createClient(runtimeSupabaseUrl, runtimeSupabaseAnonKey) : null;

const state = {
  session: null,
  user: null,
  role: 'responsible',
  unitId: 'joao-pessoa',
  units: [],
  tasks: [],
  logs: [],
  ideas: [],
  selectedTaskId: null,
  view: 'dashboard',
  statusFilter: 'all',
  monthFilter: new Date().toISOString().slice(0, 7),
  reportUnitFilter: 'all',
  csvUrl: normalizeSheetCsvUrl(localStorage.getItem('dentalmedCsvUrl') || config.GOOGLE_SHEETS_CSV_URL || ''),
  notice: '',
  error: ''
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeSheetCsvUrl(value) {
  const url = String(value || '').trim();
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (!match) return url;
  const gid = url.match(/[?&]gid=(\d+)/)?.[1] || '0';
  if (url.includes('/gviz/tq')) return url;
  if (!url.includes('/d/e/')) return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

function isAdmin() {
  return state.role === 'admin';
}

function visibleTasks() {
  return state.tasks
    .filter(task => isAdmin() || task.unit_id === state.unitId)
    .filter(task => state.statusFilter === 'all' || task.status === state.statusFilter)
    .sort((a, b) => `${a.date || ''} ${a.scheduled_time || ''}`.localeCompare(`${b.date || ''} ${b.scheduled_time || ''}`));
}

function unitName(unitId) {
  return state.units.find(unit => unit.id === unitId)?.name || 'Unidade';
}

function latestLog(taskId) {
  return state.logs.find(log => log.task_id === taskId) || null;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function formatDate(date) {
  if (!date) return 'Sem data';
  const [year, month, day] = date.split('-');
  return day && month ? `${day}/${month}` : date;
}

function formatDateTime(value) {
  if (!value) return 'Ainda nao registrado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

async function init() {
  if (!hasSupabase) {
    loadDemoMode();
    return;
  }

  const { data } = await db.auth.getSession();
  state.session = data.session;

  if (!state.session) {
    renderLogin();
    return;
  }

  await hydrateUser();
  await loadData();
  renderApp();
}

async function hydrateUser() {
  const { data: userData } = await db.auth.getUser();
  const authUser = userData.user;
  const { data: profile, error } = await db
    .from('users')
    .select('id, full_name, role, unit_id, email')
    .eq('id', authUser.id)
    .single();

  if (error) throw error;

  state.user = {
    id: authUser.id,
    email: authUser.email,
    name: profile.full_name || authUser.email
  };
  state.role = profile.role;
  state.unitId = profile.role === 'admin' ? 'all' : profile.unit_id;
}

async function loadData() {
  state.error = '';
  const [unitsResult, tasksResult, logsResult, ideasResult] = await Promise.all([
    db.from('units').select('*').order('name'),
    db.from('tasks').select('*').order('date', { ascending: true }).order('scheduled_time', { ascending: true }),
    db.from('task_logs').select('*, users(full_name, email)').order('created_at', { ascending: false }),
    db.from('content_ideas').select('*').order('created_at', { ascending: false })
  ]);

  for (const result of [unitsResult, tasksResult, logsResult, ideasResult]) {
    if (result.error) throw result.error;
  }

  state.units = unitsResult.data;
  state.tasks = tasksResult.data;
  state.logs = logsResult.data;
  state.ideas = ideasResult.data;
  if (!state.selectedTaskId && visibleTasks()[0]) state.selectedTaskId = visibleTasks()[0].id;
}

function loadDemoMode() {
  const saved = JSON.parse(localStorage.getItem('dentalmedDemoState') || '{}');
  state.user = { id: 'demo-admin', email: 'demo@dentalmed.com.br', name: 'Admin demonstracao' };
  state.role = 'admin';
  state.unitId = 'joao-pessoa';
  state.units = UNITS;
  state.tasks = createDemoTasks(saved);
  state.logs = saved.logs || [];
  state.ideas = [
    { id: 'idea-1', title: 'Dica do Academico', description: 'Explique um material essencial para estudantes.' },
    { id: 'idea-2', title: 'Favorito da Bancada', description: 'Mostre um produto muito procurado por dentistas.' },
    { id: 'idea-3', title: 'Enquete rapida', description: 'Pergunte se o publico ja usou o produto em destaque.' }
  ];
  state.notice = 'Modo demonstracao: configure o Supabase para salvar dados online.';
  state.selectedTaskId = visibleTasks()[0]?.id || null;
  renderApp();
}

function createDemoTasks(saved) {
  const base = [
    ['2026-06-15', 'Manha', 'Abertura da loja', 'Mostrar equipe chegando e loja pronta para atendimento.'],
    ['2026-06-16', 'Tarde', 'Produto premium', 'Close no produto, beneficio e CTA para visita.'],
    ['2026-06-17', 'Manha', 'Bastidores', 'Organizacao de pedidos e rotina da unidade.'],
    ['2026-06-18', 'Tarde', 'Curiosidade odontologica', 'Explicar uso de instrumental ou equipamento.'],
    ['2026-06-19', 'Manha', 'Clima de Sao Joao', 'Registrar decoracao e interacao da equipe.']
  ];

  return UNITS.flatMap(unit => base.map((row, index) => {
    const id = `${unit.id}-${index}`;
    return {
      id,
      unit_id: unit.id,
      title: row[2],
      description: row[3],
      date: row[0],
      time_period: row[1],
      scheduled_time: row[1] === 'Manha' ? '09:00' : '15:00',
      content_type: index % 2 ? 'Produto' : 'Bastidores',
      status: saved.status?.[id] || 'pending',
      responsible_id: null,
      reference_url: ''
    };
  }));
}

function persistDemoTask(task, note) {
  const saved = JSON.parse(localStorage.getItem('dentalmedDemoState') || '{}');
  saved.status = saved.status || {};
  saved.logs = saved.logs || [];
  saved.status[task.id] = task.status;
  saved.logs.unshift({
    id: crypto.randomUUID(),
    task_id: task.id,
    unit_id: task.unit_id,
    user_id: state.user.id,
    status: task.status,
    note,
    completed_at: task.status === 'completed' ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    users: { full_name: state.user.name, email: state.user.email }
  });
  localStorage.setItem('dentalmedDemoState', JSON.stringify(saved));
  state.logs = saved.logs;
}

function renderLogin() {
  app.innerHTML = `
    <section class="login-screen">
      <form class="login-card" id="loginForm">
        <img src="assets/logo.png" alt="DentalMed" />
        <h1>Story Planner</h1>
        <p>Acesse o calendario da sua unidade ou o painel administrativo.</p>
        <label class="field">
          <span>E-mail</span>
          <input type="email" name="email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Senha</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <button class="btn primary" type="submit">Entrar</button>
        ${state.error ? `<div class="message error">${escapeHtml(state.error)}</div>` : ''}
      </form>
    </section>
  `;

  document.getElementById('loginForm').addEventListener('submit', signIn);
}

async function signIn(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const { error } = await db.auth.signInWithPassword({
    email: form.get('email'),
    password: form.get('password')
  });

  if (error) {
    state.error = 'Nao foi possivel entrar. Confira e-mail e senha.';
    renderLogin();
    return;
  }

  await init();
}

async function signOut() {
  if (hasSupabase) await db.auth.signOut();
  localStorage.removeItem('dentalmedDemoState');
  window.location.reload();
}

function renderApp() {
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        ${state.notice ? `<div class="message">${escapeHtml(state.notice)}</div>` : ''}
        ${state.error ? `<div class="message error">${escapeHtml(state.error)}</div>` : ''}
        ${state.view === 'dashboard' ? renderDashboard() : ''}
        ${state.view === 'calendar' ? renderCalendar() : ''}
        ${state.view === 'reports' ? renderReports() : ''}
        ${state.view === 'sync' ? renderSync() : ''}
      </main>
      ${renderMobileNav()}
    </div>
  `;

  bindEvents();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <img src="assets/logo.png" alt="DentalMed" />
        <p>Gestao multiunidades de stories</p>
      </div>
      ${renderNav('nav')}
      <div class="user-box">
        <strong>${escapeHtml(state.user?.name || 'Usuario')}</strong>
        <div class="small">${isAdmin() ? 'Administrador' : unitName(state.unitId)}</div>
        <button class="btn ghost" data-action="logout" type="button">Sair</button>
      </div>
    </aside>
  `;
}

function renderNav(className) {
  const items = [
    ['dashboard', 'Painel'],
    ['calendar', 'Calendario'],
    ['reports', 'Relatorios'],
    ['sync', 'Sincronizar']
  ].filter(([view]) => isAdmin() || !['reports', 'sync'].includes(view));

  return `<nav class="${className}">${items.map(([view, label]) => `
    <button type="button" class="${state.view === view ? 'active' : ''}" data-view="${view}">${label}</button>
  `).join('')}</nav>`;
}

function renderMobileNav() {
  return renderNav('mobile-nav');
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div>
        <h1>${isAdmin() ? 'Painel administrativo' : unitName(state.unitId)}</h1>
        <p>${isAdmin() ? 'Acompanhe as quatro unidades DentalMed.' : 'Veja e conclua as tarefas da sua unidade.'}</p>
      </div>
      <div class="toolbar">
        ${isAdmin() ? `
          <select data-action="unit-filter">
            <option value="all">Todas as unidades</option>
            ${state.units.map(unit => `<option value="${unit.id}" ${state.unitId === unit.id ? 'selected' : ''}>${escapeHtml(unit.city)}</option>`).join('')}
          </select>
        ` : ''}
        <select data-action="status-filter">
          <option value="all">Todos os status</option>
          ${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${state.statusFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
    </header>
  `;
}

function currentTaskSet() {
  const tasks = visibleTasks();
  return isAdmin() && state.unitId !== 'all' ? tasks.filter(task => task.unit_id === state.unitId) : tasks;
}

function metricsFor(tasks) {
  const total = tasks.length;
  const completed = tasks.filter(task => task.status === 'completed').length;
  const inProgress = tasks.filter(task => task.status === 'in_progress').length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, inProgress, percent };
}

function renderMetrics(tasks) {
  const metrics = metricsFor(tasks);
  return `
    <section class="grid metrics">
      <div class="card metric"><span>Previstas</span><strong>${metrics.total}</strong></div>
      <div class="card metric"><span>Concluidas</span><strong>${metrics.completed}</strong></div>
      <div class="card metric"><span>Em andamento</span><strong>${metrics.inProgress}</strong></div>
      <div class="card metric"><span>Execucao</span><strong>${metrics.percent}%</strong></div>
    </section>
  `;
}

function renderDashboard() {
  const tasks = currentTaskSet();
  return `
    <div class="grid">
      ${renderMetrics(tasks)}
      <section class="content-grid">
        <div class="card panel">
          <div class="panel-head">
            <div>
              <h2>Tarefas da semana</h2>
              <p class="muted">Planejamento filtrado por unidade e status.</p>
            </div>
            <button class="btn ghost" data-view="calendar" type="button">Ver calendario</button>
          </div>
          ${renderTaskList(tasks.slice(0, 12))}
        </div>
        <div class="card panel">
          ${renderTaskDetail()}
        </div>
      </section>
      ${renderIdeas()}
    </div>
  `;
}

function renderIdeas() {
  const ideas = state.ideas.filter(idea => !idea.unit_id || isAdmin() || idea.unit_id === state.unitId).slice(0, 6);
  if (!ideas.length) return '';
  return `
    <section class="card panel">
      <div class="panel-head">
        <div>
          <h2>Ideias de conteudo</h2>
          <p class="muted">Sugestoes reutilizaveis para stories, CTAs e quadros editoriais.</p>
        </div>
      </div>
      <div class="task-list">
        ${ideas.map(idea => `
          <article class="task-row">
            <div>
              <strong class="task-title">${escapeHtml(idea.title)}</strong>
              <p class="small">${escapeHtml(idea.description || 'Sem descricao cadastrada.')}</p>
            </div>
            ${idea.content_type ? `<span class="tag">${escapeHtml(idea.content_type)}</span>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderCalendar() {
  const grouped = currentTaskSet().reduce((acc, task) => {
    const key = task.date || 'sem-data';
    acc[key] = acc[key] || [];
    acc[key].push(task);
    return acc;
  }, {});

  return `
    <section class="card panel">
      <div class="panel-head">
        <div>
          <h2>Calendario semanal</h2>
          <p class="muted">Lista por dia, turno e horario programado.</p>
        </div>
      </div>
      <div class="grid">
        ${Object.entries(grouped).map(([date, tasks]) => `
          <div>
            <h3>${formatDate(date)}</h3>
            ${renderTaskList(tasks)}
          </div>
        `).join('') || '<div class="empty">Nenhuma tarefa encontrada para os filtros atuais.</div>'}
      </div>
    </section>
  `;
}

function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="empty">Nenhuma tarefa encontrada.</div>';
  return `<div class="task-list">${tasks.map(task => {
    const log = latestLog(task.id);
    return `
      <article class="task-row ${state.selectedTaskId === task.id ? 'selected' : ''}" data-task="${task.id}">
        <div>
          <strong class="task-title">${escapeHtml(task.title)}</strong>
          <div class="task-meta">${formatDate(task.date)} • ${escapeHtml(task.time_period || 'Turno')} • ${escapeHtml(task.scheduled_time || 'Sem horario')}</div>
          <div class="task-tags">
            <span class="tag">${escapeHtml(unitName(task.unit_id))}</span>
            <span class="tag ${task.status}">${STATUS_LABELS[task.status] || task.status}</span>
            ${task.content_type ? `<span class="tag">${escapeHtml(task.content_type)}</span>` : ''}
          </div>
          ${log?.note ? `<p class="small">Ultima observacao: ${escapeHtml(log.note)}</p>` : ''}
        </div>
        <button class="btn ghost" type="button" data-select-task="${task.id}">Detalhes</button>
      </article>
    `;
  }).join('')}</div>`;
}

function renderTaskDetail() {
  const task = state.tasks.find(item => item.id === state.selectedTaskId) || currentTaskSet()[0];
  if (!task) return '<div class="empty">Selecione uma tarefa para ver detalhes.</div>';
  const log = latestLog(task.id);
  return `
    <div class="detail-body">
      <div>
        <h2 class="detail-title">${escapeHtml(task.title)}</h2>
        <p class="muted">${escapeHtml(task.description || 'Sem descricao cadastrada.')}</p>
      </div>
      <div class="task-tags">
        <span class="tag">${escapeHtml(unitName(task.unit_id))}</span>
        <span class="tag ${task.status}">${STATUS_LABELS[task.status] || task.status}</span>
        <span class="tag">${formatDate(task.date)}</span>
      </div>
      ${task.reference_url ? `<a href="${escapeHtml(task.reference_url)}" target="_blank" rel="noreferrer">Abrir referencia</a>` : ''}
      <label class="field">
        <span>Status</span>
        <select data-detail-status="${task.id}">
          ${Object.entries(STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Observacao</span>
        <textarea data-detail-note="${task.id}" placeholder="Adicione detalhes do que foi postado, ajustes ou pendencias.">${escapeHtml(log?.note || '')}</textarea>
      </label>
      <div class="actions">
        <button class="btn success" data-complete-task="${task.id}" type="button">Concluir tarefa</button>
        <button class="btn primary" data-save-task="${task.id}" type="button">Salvar status</button>
      </div>
      <p class="small">Ultimo registro: ${formatDateTime(log?.created_at)} ${log?.users ? `por ${escapeHtml(log.users.full_name || log.users.email)}` : ''}</p>
    </div>
  `;
}

function renderReports() {
  const month = state.monthFilter || todayMonth();
  const tasks = state.tasks.filter(task => (task.date || '').startsWith(month));
  const scoped = state.reportUnitFilter === 'all' ? tasks : tasks.filter(task => task.unit_id === state.reportUnitFilter);
  const metrics = metricsFor(scoped);
  const ranking = state.units.map(unit => {
    const unitTasks = tasks.filter(task => task.unit_id === unit.id);
    const unitMetrics = metricsFor(unitTasks);
    return { unit, ...unitMetrics };
  }).sort((a, b) => b.completed - a.completed);

  return `
    <div class="grid">
      <section class="card panel">
        <div class="panel-head">
          <div>
            <h2>Relatorios mensais</h2>
            <p class="muted">Resumo de execucao e media mensal de postagens.</p>
          </div>
          <div class="toolbar">
            <input type="month" value="${month}" data-action="month-filter" />
            <select data-action="report-unit-filter">
              <option value="all">Todas as unidades</option>
              ${state.units.map(unit => `<option value="${unit.id}" ${state.reportUnitFilter === unit.id ? 'selected' : ''}>${escapeHtml(unit.city)}</option>`).join('')}
            </select>
            <button class="btn primary" data-action="export-csv" type="button">Exportar CSV</button>
          </div>
        </div>
        ${renderMetrics(scoped)}
      </section>
      <section class="content-grid">
        <div class="card panel">
          <h2>Ranking de unidades</h2>
          <div class="rank-list">
            ${ranking.map((item, index) => `
              <div class="rank-row">
                <div>
                  <strong>${index + 1}. ${escapeHtml(item.unit.city)}</strong>
                  <div class="small">${item.total} previstas • ${item.completed} concluidas</div>
                </div>
                <strong>${item.percent}%</strong>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="card panel">
          <h2>Ultimos registros</h2>
          <div class="log-list">
            ${state.logs.slice(0, 8).map(log => `
              <div class="log-row">
                <div>
                  <strong>${STATUS_LABELS[log.status] || log.status}</strong>
                  <div class="small">${escapeHtml(unitName(log.unit_id))} • ${formatDateTime(log.created_at)}</div>
                </div>
              </div>
            `).join('') || '<div class="empty">Nenhum registro ainda.</div>'}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderSync() {
  return `
    <section class="card panel">
      <div class="panel-head">
        <div>
          <h2>Sincronizacao com planilha</h2>
          <p class="muted">Use um CSV publicado do Google Sheets. A sincronizacao cria ou atualiza tarefas sem duplicar.</p>
        </div>
      </div>
      <div class="sync-box">
        <div class="message">
          ${hasSupabase ? 'Supabase conectado neste navegador.' : 'Supabase ainda nao configurado. Preencha os campos abaixo para testar a conexao.'}
        </div>
        <label class="field">
          <span>SUPABASE_URL</span>
          <input type="url" value="${escapeHtml(runtimeSupabaseUrl || '')}" data-action="runtime-supabase-url" placeholder="https://seu-projeto.supabase.co" />
        </label>
        <label class="field">
          <span>SUPABASE_ANON_KEY</span>
          <input type="password" value="${escapeHtml(runtimeSupabaseAnonKey || '')}" data-action="runtime-supabase-key" placeholder="eyJ..." />
        </label>
        <div class="actions">
          <button class="btn ghost" data-action="save-supabase-config" type="button">Salvar Supabase neste navegador</button>
        </div>
        <label class="field">
          <span>URL CSV publicada</span>
          <input type="url" value="${escapeHtml(state.csvUrl)}" data-action="csv-url" placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv" />
        </label>
        <div class="actions">
          <button class="btn primary" data-action="sync-csv" type="button">Sincronizar agora</button>
          <button class="btn ghost" data-action="save-csv-url" type="button">Salvar URL</button>
        </div>
        <div class="message">
          Colunas esperadas: unidade, data, horario, turno, titulo, descricao, tipo de conteudo, cta, enquete, link de referencia, responsavel, status inicial.
        </div>
      </div>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    state.notice = '';
    renderApp();
  }));

  document.querySelectorAll('[data-select-task]').forEach(button => button.addEventListener('click', () => {
    state.selectedTaskId = button.dataset.selectTask;
    state.view = 'dashboard';
    renderApp();
  }));

  document.querySelector('[data-action="logout"]')?.addEventListener('click', signOut);
  document.querySelector('[data-action="status-filter"]')?.addEventListener('change', event => {
    state.statusFilter = event.target.value;
    renderApp();
  });
  document.querySelector('[data-action="unit-filter"]')?.addEventListener('change', event => {
    state.unitId = event.target.value;
    renderApp();
  });
  document.querySelector('[data-action="month-filter"]')?.addEventListener('change', event => {
    state.monthFilter = event.target.value;
    renderApp();
  });
  document.querySelector('[data-action="report-unit-filter"]')?.addEventListener('change', event => {
    state.reportUnitFilter = event.target.value;
    renderApp();
  });
  document.querySelector('[data-action="export-csv"]')?.addEventListener('click', exportReportCsv);
  document.querySelector('[data-action="save-csv-url"]')?.addEventListener('click', saveCsvUrl);
  document.querySelector('[data-action="sync-csv"]')?.addEventListener('click', syncCsv);
  document.querySelector('[data-action="save-supabase-config"]')?.addEventListener('click', saveSupabaseConfig);

  document.querySelectorAll('[data-complete-task]').forEach(button => button.addEventListener('click', () => saveTask(button.dataset.completeTask, 'completed')));
  document.querySelectorAll('[data-save-task]').forEach(button => {
    button.addEventListener('click', () => {
      const status = document.querySelector(`[data-detail-status="${button.dataset.saveTask}"]`)?.value;
      saveTask(button.dataset.saveTask, status);
    });
  });
}

async function saveTask(taskId, status) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;

  const note = document.querySelector(`[data-detail-note="${taskId}"]`)?.value || '';
  task.status = status || task.status;

  if (!hasSupabase) {
    persistDemoTask(task, note);
    state.notice = 'Tarefa atualizada no modo demonstracao.';
    renderApp();
    return;
  }

  const completedAt = task.status === 'completed' ? new Date().toISOString() : null;
  const { error: taskError } = await db
    .from('tasks')
    .update({ status: task.status, updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (taskError) {
    state.error = taskError.message;
    renderApp();
    return;
  }

  const { error: logError } = await db.from('task_logs').insert({
    task_id: task.id,
    unit_id: task.unit_id,
    user_id: state.user.id,
    status: task.status,
    note,
    completed_at: completedAt
  });

  if (logError) state.error = logError.message;
  else state.notice = 'Tarefa atualizada com sucesso.';

  await loadData();
  renderApp();
}

function saveCsvUrl() {
  const input = document.querySelector('[data-action="csv-url"]');
  state.csvUrl = normalizeSheetCsvUrl(input?.value || '');
  localStorage.setItem('dentalmedCsvUrl', state.csvUrl);
  state.notice = 'URL da planilha salva neste navegador.';
  renderApp();
}

function saveSupabaseConfig() {
  const url = document.querySelector('[data-action="runtime-supabase-url"]')?.value.trim() || '';
  const key = document.querySelector('[data-action="runtime-supabase-key"]')?.value.trim() || '';
  if (!url || !key) {
    state.error = 'Informe SUPABASE_URL e SUPABASE_ANON_KEY.';
    renderApp();
    return;
  }
  localStorage.setItem('dentalmedSupabaseUrl', url);
  localStorage.setItem('dentalmedSupabaseAnonKey', key);
  window.location.reload();
}

async function syncCsv() {
  if (!isAdmin()) return;
  saveCsvUrl();

  if (!hasSupabase) {
    state.error = 'Configure o Supabase antes de sincronizar tarefas reais.';
    renderApp();
    return;
  }

  if (!state.csvUrl) {
    state.error = 'Informe a URL do CSV publicado.';
    renderApp();
    return;
  }

  try {
    const response = await fetch(state.csvUrl);
    if (!response.ok) throw new Error('Nao foi possivel baixar a planilha.');
    const rows = parseCsv(await response.text());
    const payload = rows.map(csvRowToTask).filter(Boolean);
    if (!payload.length) throw new Error('Nenhuma tarefa valida encontrada no CSV.');
    const { error } = await db.from('tasks').upsert(payload, { onConflict: 'source_key' });
    if (error) throw error;
    state.notice = `${payload.length} tarefas sincronizadas.`;
    await loadData();
  } catch (error) {
    state.error = error.message;
  }
  renderApp();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (cell || row.length) rows.push([...row, cell]);
      row = [];
      cell = '';
      if (char === '\r' && next === '\n') index += 1;
    } else {
      cell += char;
    }
  }
  if (cell || row.length) rows.push([...row, cell]);

  const headers = rows.shift()?.map(normalize) || [];
  return rows.map(values => headers.reduce((acc, header, index) => {
    acc[header] = values[index]?.trim() || '';
    return acc;
  }, {}));
}

function csvRowToTask(row) {
  const unit = findUnit(row.unidade);
  const title = row.titulo || row['titulo'] || row.title;
  const date = parseDate(row.data);
  if (!unit || !title || !date) return null;
  const status = normalizeStatus(row['status inicial'] || row.status || 'pending');
  const sourceKey = `${unit.id}:${date}:${normalize(row.turno || row.time_period)}:${normalize(title)}`;
  return {
    unit_id: unit.id,
    title,
    description: [row.descricao, row.cta, row.enquete].filter(Boolean).join('\n'),
    date,
    time_period: row.turno || row.periodo || null,
    scheduled_time: row.horario || null,
    content_type: row['tipo de conteudo'] || row.tipo || null,
    status,
    reference_url: row['link de referencia'] || row.referencia || null,
    source_key: sourceKey,
    updated_at: new Date().toISOString()
  };
}

function findUnit(value) {
  const needle = normalize(value);
  return state.units.find(unit => normalize(unit.name).includes(needle) || normalize(unit.city).includes(needle) || needle.includes(normalize(unit.city)));
}

function parseDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function normalizeStatus(value) {
  const status = normalize(value);
  if (status.includes('andamento')) return 'in_progress';
  if (status.includes('conclu') || status.includes('feito')) return 'completed';
  if (status.includes('nao')) return 'not_done';
  return 'pending';
}

function exportReportCsv() {
  const month = state.monthFilter || todayMonth();
  const rows = [['Unidade', 'Previstas', 'Concluidas', 'Execucao']];
  state.units.forEach(unit => {
    const tasks = state.tasks.filter(task => task.unit_id === unit.id && (task.date || '').startsWith(month));
    const metrics = metricsFor(tasks);
    rows.push([unit.city, metrics.total, metrics.completed, `${metrics.percent}%`]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-dentalmed-${month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

init().catch(error => {
  state.error = error.message || 'Erro ao iniciar aplicativo.';
  renderLogin();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
