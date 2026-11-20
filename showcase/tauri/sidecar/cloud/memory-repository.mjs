// Development repository adapter. Data is intentionally process-local and disappears on restart.
// Replace this adapter with a durable database adapter before production deployment.
import { randomUUID } from 'node:crypto';

export function createMemoryRepository() {
  const sessions = new Map();
  const messages = new Map();
  const tasks = new Map();

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
    async listMessages(userId, sessionId) {
      if (!(await this.getSession(userId, sessionId))) return null;
      return [...(messages.get(sessionId) ?? [])];
    },
    async createTask(userId, { sessionId, kind, input }) {
      if (!(await this.getSession(userId, sessionId))) return null;
      const now = new Date().toISOString();
      const task = { id: randomUUID(), sessionId, kind, status: 'queued', input, createdAt: now, updatedAt: now };
      tasks.set(task.id, { userId, task });
      return task;
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
