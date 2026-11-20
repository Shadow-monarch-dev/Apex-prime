// Single-process JSON-file repository for the standalone API.
// Uses private directory/file permissions and atomic replacement. For multi-instance deployments,
// use a transactional database adapter; this adapter intentionally does not coordinate processes.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const emptyState = () => ({ version: 1, sessions: [], messages: [], tasks: [], events: [] });
const clone = (value) => value == null ? value : structuredClone(value);

export function createFileRepository({ directory } = {}) {
  if (!directory || typeof directory !== 'string') throw new Error('A data directory is required');
  const file = path.resolve(directory, 'apex-state.json');
  let statePromise;
  let writes = Promise.resolve();

  async function load() {
    if (!statePromise) {
      statePromise = (async () => {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
          if (parsed?.version !== 1 || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.messages) || !Array.isArray(parsed.tasks) || (parsed.events !== undefined && !Array.isArray(parsed.events))) {
            throw new Error('Unsupported or invalid APEX data file; refusing to overwrite it.');
          }
          return parsed;
        } catch (error) {
          if (error.code === 'ENOENT') return emptyState();
          throw error;
        }
      })();
    }
    return statePromise;
  }

  async function persist(next) {
    const run = async () => {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = path.join(directory, `.apex-state-${process.pid}-${randomUUID()}.tmp`);
      try {
        const handle = await fs.open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify(next));
          await handle.sync();
        } finally { await handle.close(); }
        await fs.rename(temp, file);
      } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
    };
    await run();
    statePromise = Promise.resolve(next);
  }

  async function change(mutator) {
    const run = async () => {
      const current = await load();
      const next = clone(current);
      const result = await mutator(next);
      await persist(next);
      return clone(result);
    };
    const pending = writes.then(run, run);
    writes = pending.then(() => {}, () => {});
    return pending;
  }

  return {
    async createSession({ userId, title = '' }) {
      return change((db) => {
        const now = new Date().toISOString();
        const session = { id: randomUUID(), userId, title, status: 'active', createdAt: now, updatedAt: now };
        db.sessions.push(session);
        return session;
      });
    },
    async listSessions(userId) {
      const db = await load();
      return clone(db.sessions.filter((s) => s.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    },
    async getSession(userId, sessionId) {
      const db = await load();
      return clone(db.sessions.find((s) => s.id === sessionId && s.userId === userId) ?? null);
    },
    async addMessage(userId, sessionId, content) {
      return change((db) => {
        const session = db.sessions.find((s) => s.id === sessionId && s.userId === userId && s.status === 'active');
        if (!session) return null;
        const message = { id: randomUUID(), sessionId, role: 'user', content, createdAt: new Date().toISOString() };
        db.messages.push(message);
        session.updatedAt = message.createdAt;
        return message;
      });
    },
    async listMessages(userId, sessionId) {
      const db = await load();
      if (!db.sessions.some((s) => s.id === sessionId && s.userId === userId)) return null;
      return clone(db.messages.filter((m) => m.sessionId === sessionId));
    },
    async createTask(userId, { sessionId, kind, input }) {
      return change((db) => {
        if (!db.sessions.some((s) => s.id === sessionId && s.userId === userId)) return null;
        const now = new Date().toISOString();
        const task = { id: randomUUID(), sessionId, kind, status: 'queued', input, createdAt: now, updatedAt: now };
        db.tasks.push({ userId, task });
        db.events ??= [];
        db.events.push({ userId, event: { id: randomUUID(), taskId: task.id, type: 'created', message: 'Task queued', createdAt: now } });
        return task;
      });
    },
    async updateTaskStatus(userId, taskId, status, message) {
      return change((db) => {
        const entry = db.tasks.find((item) => item.userId === userId && item.task.id === taskId);
        if (!entry) return null;
        const allowed = {
          queued: ['running', 'cancelled'],
          running: ['waiting_approval', 'succeeded', 'failed', 'cancelled'],
          waiting_approval: ['running', 'cancelled'],
          succeeded: [], failed: [], cancelled: [],
        };
        if (!allowed[entry.task.status]?.includes(status)) {
          const error = new Error(`Invalid task transition: ${entry.task.status} -> ${status}`);
          error.code = 'INVALID_TRANSITION';
          throw error;
        }
        const now = new Date().toISOString();
        entry.task.status = status;
        entry.task.updatedAt = now;
        const event = { id: randomUUID(), taskId, type: status === 'running' ? 'started' : status === 'waiting_approval' ? 'approval_required' : status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'progress', message, createdAt: now };
        db.events ??= [];
        db.events.push({ userId, event });
        return entry.task;
      });
    },
    async listTaskEvents(userId, taskId) {
      const db = await load();
      if (!db.tasks.some((entry) => entry.userId === userId && entry.task.id === taskId)) return null;
      return clone((db.events ?? []).filter((entry) => entry.userId === userId && entry.event.taskId === taskId).map((entry) => entry.event));
    },
    async getTask(userId, taskId) {
      const db = await load();
      return clone(db.tasks.find((entry) => entry.userId === userId && entry.task.id === taskId)?.task ?? null);
    },
    async listTasks(userId, sessionId) {
      const db = await load();
      return clone(db.tasks.filter((entry) => entry.userId === userId && (!sessionId || entry.task.sessionId === sessionId)).map((entry) => entry.task));
    },
  };
}
