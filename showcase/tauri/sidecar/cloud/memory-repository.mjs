// Development repository adapter. Data is intentionally process-local and disappears on restart.
// Replace this adapter with a durable database adapter before production deployment.
import { randomUUID } from 'node:crypto';

export function createMemoryRepository() {
  const sessions = new Map();
  const messages = new Map();
  const tasks = new Map();
  const events = new Map();

  return {
    async createSession({ userId, title = '' }) {
      const now = new Date().toISOString();
      const session = { id: randomUUID(), userId, title, status: 'active', createdAt: now, updatedAt: now };
      sessions.set(session.id, session);
      messages.set(session.id, []);
      return session;
    },
    async listSessions(userId) {
      return [...sessions.values()].filter((s) => s.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async getSession(userId, sessionId) {
      const session = sessions.get(sessionId);
      return session?.userId === userId ? session : null;
    },
    async addMessage(userId, sessionId, content) {
      const session = await this.getSession(userId, sessionId);
      if (!session || session.status !== 'active') return null;
      const message = { id: randomUUID(), sessionId, role: 'user', content, createdAt: new Date().toISOString() };
      messages.get(sessionId).push(message);
      session.updatedAt = message.createdAt;
      return message;
    },
    async addAssistantMessage(userId, sessionId, content) {
      const session = await this.getSession(userId, sessionId);
      if (!session || session.status !== 'active') return null;
      const message = { id: randomUUID(), sessionId, role: 'assistant', content, createdAt: new Date().toISOString() };
      messages.get(sessionId).push(message);
      session.updatedAt = message.createdAt;
      return message;
    },
    async listMessages(userId, sessionId) {
      if (!(await this.getSession(userId, sessionId))) return null;
      return [...(messages.get(sessionId) ?? [])];
    },
    async createTask(userId, { sessionId, kind, input }) {
      if (!(await this.getSession(userId, sessionId))) return null;
      const now = new Date().toISOString();
      const task = { id: randomUUID(), sessionId, kind, status: 'queued', input, createdAt: now, updatedAt: now };
      tasks.set(task.id, { userId, task });
      events.set(task.id, [{ id: randomUUID(), taskId: task.id, type: 'created', message: 'Task queued', createdAt: now }]);
      return task;
    },
    async updateTaskStatus(userId, taskId, status, message) {
      const entry = tasks.get(taskId);
      if (!entry || entry.userId !== userId) return null;
      const allowed = { queued: ['running', 'cancelled'], running: ['waiting_approval', 'succeeded', 'failed', 'cancelled'], waiting_approval: ['running', 'cancelled'], succeeded: [], failed: [], cancelled: [] };
      if (!allowed[entry.task.status]?.includes(status)) {
        const error = new Error(`Invalid task transition: ${entry.task.status} -> ${status}`);
        error.code = 'INVALID_TRANSITION';
        throw error;
      }
      const now = new Date().toISOString();
      entry.task.status = status;
      entry.task.updatedAt = now;
      const event = { id: randomUUID(), taskId, type: status === 'running' ? 'started' : status === 'waiting_approval' ? 'approval_required' : status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : status === 'cancelled' ? 'cancelled' : 'progress', message, createdAt: now };
      if (!events.has(taskId)) events.set(taskId, []);
      events.get(taskId).push(event);
      return entry.task;
    },
    async listTaskEvents(userId, taskId) {
      const entry = tasks.get(taskId);
      return entry?.userId === userId ? [...(events.get(taskId) ?? [])] : null;
    },
    async getTask(userId, taskId) {
      const entry = tasks.get(taskId);
      return entry?.userId === userId ? entry.task : null;
    },
    async listTasks(userId, sessionId) {
      return [...tasks.values()].filter((entry) => entry.userId === userId && (!sessionId || entry.task.sessionId === sessionId)).map((entry) => entry.task);
    },
  };
}
