// Registered-handler task worker. It never executes arbitrary shell/code from task input.
export function createTaskWorker({ repository, handlers = {}, pollIntervalMs = 1_000, onError = () => {} } = {}) {
  if (!repository || typeof repository.claimNextTask !== 'function' || typeof repository.updateTaskStatus !== 'function') {
    throw new Error('A repository with atomic task claiming is required');
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 100) throw new Error('pollIntervalMs must be an integer >= 100');
  for (const [kind, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') throw new Error(`Handler for ${kind} must be a function`);
  }

  let stopped = true;
  let timer;
  let active = false;

  async function runOnce() {
    if (active) return null;
    active = true;
    try {
      const claimed = await repository.claimNextTask();
      if (!claimed) return null;
      const { userId, task } = claimed;
      const handler = handlers[task.kind];
      if (!handler) {
        await repository.updateTaskStatus(userId, task.id, 'failed', 'No registered handler for this task type');
        return { taskId: task.id, status: 'failed', reason: 'handler_not_registered' };
      }
      try {
        const result = await handler({ task: structuredClone(task), userId, approvalDecision: task.approvalDecision ?? null });
        if (result?.requiresApproval === true) {
          await repository.updateTaskStatus(userId, task.id, 'waiting_approval', String(result.message || 'Human approval required').slice(0, 10_000));
          return { taskId: task.id, status: 'waiting_approval' };
        }
        if (typeof repository.completeTask === 'function') {
          await repository.completeTask(userId, task.id, result && typeof result === 'object' && !Array.isArray(result) ? result : { value: result ?? null });
        } else {
          await repository.updateTaskStatus(userId, task.id, 'succeeded', 'Task completed');
        }
        return { taskId: task.id, status: 'succeeded', result };
      } catch (error) {
        try { onError(error, task); } catch {}
        await repository.updateTaskStatus(userId, task.id, 'failed', 'Task handler failed');
        return { taskId: task.id, status: 'failed', reason: 'handler_failed' };
      }
    } finally {
      active = false;
    }
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(async () => {
      try { await runOnce(); } catch (error) { try { onError(error, null); } catch {} }
      schedule();
    }, pollIntervalMs);
    timer.unref?.();
  }

  return {
    runOnce,
    start() {
      if (!stopped) return this.stop;
      stopped = false;
      schedule();
      return this.stop;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
    get isRunning() { return !stopped; },
  };
}
