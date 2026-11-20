// Safe built-in cloud handlers. Only chat tasks are executable here; other task kinds
// remain fail-closed until reviewed, capability-specific implementations are registered.
export function createAssistantTaskHandlers({ repository, chatProvider } = {}) {
  if (!repository || typeof repository.getSession !== 'function' || typeof repository.listMessages !== 'function' ||
      typeof repository.addAssistantMessage !== 'function' || typeof repository.addMessage !== 'function') throw new Error('A compatible repository is required');
  if (!chatProvider || typeof chatProvider.complete !== 'function') throw new Error('A configured chat provider is required');

  return Object.freeze({
    chat: async ({ task, userId, approvalDecision }) => {
      if (approvalDecision?.decision === 'reject') throw new Error('Rejected task cannot execute');
      const content = task?.input?.content;
      if (typeof content !== 'string' || !content.trim() || content.length > 20_000) {
        throw new Error('Chat task input.content must be a non-empty string of at most 20,000 characters');
      }
      const session = await repository.getSession(userId, task.sessionId);
      if (!session || session.status !== 'active') throw new Error('Active session not found');
      const history = await repository.listMessages(userId, task.sessionId);
      const userMessage = await repository.addMessage(userId, task.sessionId, content.trim());
      if (!userMessage) throw new Error('Could not save user message');
      const answer = await chatProvider.complete([
        ...history.slice(-19).map(({ role, content: text }) => ({ role, content: text })),
        { role: 'user', content: userMessage.content },
      ]);
      const message = await repository.addAssistantMessage(userId, task.sessionId, answer);
      if (!message) throw new Error('Could not save assistant response');
      return { messageId: message.id, content: message.content };
    },
  });
}
