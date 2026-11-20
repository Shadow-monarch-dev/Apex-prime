(() => {
  const $ = (id) => document.getElementById(id);
  const state = { baseUrl: '', token: '', sessionId: '', sessions: [], busy: false };
  const views = ['chat', 'agents', 'tasks', 'memory', 'connections'];
  const configKey = 'apex-prime-session-config';
  const dialog = $('settings-dialog');
  const escapeText = (value) => String(value ?? '');
  const toast = (message) => {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  };
  const apiUrl = () => state.baseUrl.replace(/\/$/, '');
  const api = async (path, options = {}) => {
    if (!state.baseUrl || !state.token) throw new Error('Connect your APEX PRIME API in Settings first.');
    const response = await fetch(apiUrl() + path, {
      ...options, redirect: 'error',
      headers: { accept: 'application/json', authorization: 'Bearer ' + state.token, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers },
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('The API returned an invalid response.'); }
    if (!response.ok) throw new Error(data?.error?.message || 'API request failed (' + response.status + ').');
    return data;
  };
  const setConnection = (online, label) => {
    $('status-dot').classList.toggle('online', online);
    $('connection-label').textContent = label;
  };
  const showView = (name) => {
    views.forEach((view) => {
      $('view-' + view).classList.toggle('active', view === name);
      document.querySelector('[data-view="' + view + '"]').classList.toggle('active', view === name);
    });
    $('view-title').textContent = ({ chat: 'AI Chat', agents: 'Agents', tasks: 'Tasks', memory: 'Memory', connections: 'Connections' })[name];
    $('sidebar').classList.remove('open');
    if (name === 'tasks') loadTasks();
  };
  const addMessage = (role, content, pending = false) => {
    $('welcome').style.display = 'none';
    $('messages').classList.add('visible');
    const row = document.createElement('article'); row.className = 'message ' + role + (pending ? ' pending' : '');
    const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'YOU' : 'AP';
    const body = document.createElement('div'); body.className = 'message-body'; body.textContent = escapeText(content);
    row.append(avatar, body); $('messages').append(row); $('messages').scrollTop = $('messages').scrollHeight;
    return { row, body };
  };
  const resetChat = () => {
    state.sessionId = ''; $('messages').replaceChildren(); $('messages').classList.remove('visible'); $('welcome').style.display = '';
    document.querySelectorAll('.session-button').forEach((button) => button.classList.remove('selected'));
  };
  const renderSessions = () => {
    const list = $('session-list'); list.replaceChildren();
    if (!state.sessions.length) { const empty = document.createElement('p'); empty.className = 'muted small'; empty.textContent = state.token ? 'No conversations yet.' : 'Connect your cloud API to load conversations.'; list.append(empty); return; }
    state.sessions.forEach((session) => {
      const button = document.createElement('button'); button.className = 'session-button' + (session.id === state.sessionId ? ' selected' : '');
      button.textContent = session.title || 'New conversation'; button.title = button.textContent;
      button.addEventListener('click', () => openSession(session.id)); list.append(button);
    });
  };
  const loadSessions = async () => {
    const data = await api('/api/v1/sessions'); state.sessions = data.sessions || []; renderSessions();
  };
  const openSession = async (id) => {
    try {
      state.sessionId = id; const data = await api('/api/v1/sessions/' + encodeURIComponent(id));
      const history = await api('/api/v1/sessions/' + encodeURIComponent(id) + '/messages');
      $('messages').replaceChildren(); $('messages').classList.add('visible'); $('welcome').style.display = 'none';
      (history.messages || []).forEach((message) => addMessage(message.role === 'user' ? 'user' : 'assistant', message.content));
      renderSessions(); showView('chat');
    } catch (error) { toast(error.message); }
  };
  const newSession = async () => {
    if (!state.token) { dialog.showModal(); return; }
    try {
      const data = await api('/api/v1/sessions', { method: 'POST', body: JSON.stringify({ title: 'New conversation' }) });
      state.sessionId = data.session.id; state.sessions.unshift(data.session); renderSessions(); resetChat(); state.sessionId = data.session.id; renderSessions(); showView('chat'); $('prompt').focus();
    } catch (error) { toast(error.message); }
  };
  const sendMessage = async (content) => {
    const text = content.trim(); if (!text || state.busy) return;
    if (!state.token) { dialog.showModal(); toast('Connect your cloud API before chatting.'); return; }
    if (!state.sessionId) {
      const created = await api('/api/v1/sessions', { method: 'POST', body: JSON.stringify({ title: text.slice(0, 56) }) });
      state.sessionId = created.session.id; state.sessions.unshift(created.session); renderSessions();
    }
    addMessage('user', text); $('prompt').value = ''; $('prompt').style.height = 'auto';
    state.busy = true; $('send-button').disabled = true;
    const pending = addMessage('assistant', 'Thinking…', true);
    try {
      const data = await api('/api/v1/chat', { method: 'POST', body: JSON.stringify({ sessionId: state.sessionId, content: text }) });
      pending.body.textContent = data.message.content; pending.row.classList.remove('pending');
      await loadSessions();
    } catch (error) {
      pending.body.textContent = error.message; pending.row.classList.remove('pending');
    } finally { state.busy = false; $('send-button').disabled = false; $('prompt').focus(); }
  };
  const loadTasks = async () => {
    const list = $('task-list'); list.replaceChildren();
    try {
      const data = await api('/api/v1/tasks'); const tasks = data.tasks || [];
      if (!tasks.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No cloud tasks yet.'; list.append(empty); return; }
      tasks.slice().reverse().forEach((task) => {
        const row = document.createElement('div'); row.className = 'task-row';
        const name = document.createElement('span'); name.textContent = task.kind + ' · ' + task.id.slice(0, 8);
        const status = document.createElement('span'); status.className = 'task-state'; status.textContent = task.status.replace('_', ' ');
        row.append(name, status); list.append(row);
      });
    } catch (error) { const message = document.createElement('p'); message.className = 'muted'; message.textContent = error.message; list.append(message); }
  };
  const testConnection = async () => {
    const baseUrl = $('api-url').value.trim().replace(/\/$/, '');
    const token = $('api-token').value.trim();
    if (!baseUrl || !token) throw new Error('Enter both the API URL and owner access token.');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use HTTPS except for localhost development.');
    const response = await fetch(baseUrl + '/health', { redirect: 'error', headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('API health check failed (' + response.status + ').');
    const health = await response.json();
    if (health.status !== 'online') throw new Error('APEX PRIME API is not online.');
    const check = await fetch(baseUrl + '/api/v1/sessions', { headers: { authorization: 'Bearer ' + token, accept: 'application/json' }, redirect: 'error' });
    if (!check.ok) throw new Error(check.status === 401 ? 'Access token was rejected.' : 'Authenticated API check failed (' + check.status + ').');
    return { baseUrl, token };
  };
  const connect = async (persist) => {
    const feedback = $('settings-feedback'); feedback.textContent = 'Checking API…';
    try {
      const config = await testConnection(); state.baseUrl = config.baseUrl; state.token = config.token;
      if (persist) sessionStorage.setItem(configKey, JSON.stringify(config));
      setConnection(true, 'Cloud connected'); await loadSessions(); feedback.textContent = 'Connected. Your workspace is ready.';
      dialog.close();
    } catch (error) { feedback.textContent = error.message; setConnection(false, 'Not connected'); }
  };
  $('chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendMessage($('prompt').value).catch((error) => toast(error.message)); });
  $('prompt').addEventListener('input', (event) => { event.target.style.height = 'auto'; event.target.style.height = Math.min(event.target.scrollHeight, 180) + 'px'; });
  $('prompt').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('chat-form').requestSubmit(); } });
  $('new-chat').addEventListener('click', newSession);
  $('refresh-chats').addEventListener('click', () => loadSessions().catch((error) => toast(error.message)));
  $('refresh-tasks').addEventListener('click', loadTasks);
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { $('prompt').value = button.dataset.prompt; $('prompt').focus(); }));
  ['open-settings', 'top-settings'].forEach((id) => $(id).addEventListener('click', () => { $('api-url').value = state.baseUrl; $('api-token').value = state.token; $('settings-feedback').textContent = ''; dialog.showModal(); }));
  $('test-connection').addEventListener('click', () => connect(false));
  $('save-connection').addEventListener('click', () => connect(true));
  $('mobile-menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  try {
    const saved = JSON.parse(sessionStorage.getItem(configKey) || 'null');
    if (saved?.baseUrl && saved?.token) { state.baseUrl = saved.baseUrl; state.token = saved.token; loadSessions().then(() => setConnection(true, 'Cloud connected')).catch(() => { setConnection(false, 'Reconnect required'); }); }
  } catch { sessionStorage.removeItem(configKey); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();