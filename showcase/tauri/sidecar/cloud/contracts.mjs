// APEX PRIME cloud API contracts.
// These schemas are transport-neutral: the desktop sidecar can validate payloads before
// any future cloud adapter is connected. Keep secrets and provider credentials out of these DTOs.
import { z } from 'zod';

const id = z.string().min(1).max(128);
const isoDate = z.string().datetime({ offset: true });
const nonEmptyText = z.string().trim().min(1).max(100_000);

export const SessionStatusSchema = z.enum(['active', 'archived']);
export const TaskStatusSchema = z.enum(['queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled']);
export const TaskKindSchema = z.enum(['chat', 'research', 'code', 'computer', 'workflow']);

export const SessionSchema = z.object({
  id,
  userId: id,
  title: z.string().trim().max(300).default(''),
  status: SessionStatusSchema.default('active'),
  createdAt: isoDate,
  updatedAt: isoDate,
}).strict();

export const MessageSchema = z.object({
  id,
  sessionId: id,
  role: z.enum(['user', 'assistant', 'system']),
  content: nonEmptyText,
  createdAt: isoDate,
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const CreateSessionRequestSchema = z.object({
  title: z.string().trim().max(300).optional(),
}).strict();

export const CreateMessageRequestSchema = z.object({
  content: nonEmptyText,
}).strict();

export const TaskSchema = z.object({
  id,
  sessionId: id,
  kind: TaskKindSchema,
  status: TaskStatusSchema,
  input: z.record(z.string(), z.unknown()),
  createdAt: isoDate,
  updatedAt: isoDate,
  approvalDecision: z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().max(2_000).optional(), decidedAt: isoDate }).strict().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const CreateTaskRequestSchema = z.object({
  sessionId: id,
  kind: TaskKindSchema,
  input: z.record(z.string(), z.unknown()),
}).strict();

export const TaskEventSchema = z.object({
  id,
  taskId: id,
  type: z.enum(['created', 'started', 'progress', 'approval_required', 'approval_decided', 'completed', 'failed', 'cancelled']),
  message: z.string().max(10_000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: isoDate,
}).strict();

export const ApprovalDecisionSchema = z.object({
  approvalId: id,
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(2_000).optional(),
}).strict();

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(2_000),
    requestId: z.string().max(128).optional(),
  }).strict(),
}).strict();

// Parse at trust boundaries. Callers receive Zod's structured validation error on bad input.
export function parseContract(schema, value) {
  return schema.parse(value);
}

export const UpdateTaskStatusRequestSchema = z.object({
  status: TaskStatusSchema,
  message: z.string().trim().max(10_000).optional(),
}).strict();

export const CreateChatRequestSchema = z.object({
  sessionId: id,
  content: nonEmptyText.max(20_000),
}).strict();
