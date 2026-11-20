// Capability registry: distinguishes implemented desktop features from cloud-ready features.
// This is metadata for truthful UI rendering, not a claim that every capability is remotely hosted.
export const APEX_CAPABILITIES = Object.freeze([
  { id: 'chat', label: 'AI chat', surface: 'cloud', status: 'available', safety: 'authenticated' },
  { id: 'sessions', label: 'Persistent conversations', surface: 'cloud', status: 'available', safety: 'user-scoped' },
  { id: 'tasks', label: 'Background task queue', surface: 'cloud', status: 'foundation', safety: 'registered-handlers-only' },
  { id: 'approvals', label: 'Human approval gates', surface: 'cloud', status: 'available', safety: 'owner-authenticated' },
  { id: 'desktop-agents', label: 'Background maker, researcher and organizer agents', surface: 'desktop', status: 'available', safety: 'existing-sidecar-guardrails' },
  { id: 'long-term-memory', label: 'Commitments and conversation memory', surface: 'desktop', status: 'available', safety: 'local-private-storage' },
  { id: 'scheduled-jobs', label: 'Recurring and one-off agent jobs', surface: 'desktop', status: 'available', safety: 'local-scheduler' },
  { id: 'mcp-integrations', label: 'External app integrations via MCP', surface: 'desktop', status: 'available', safety: 'server-and-tool-screening' },
  { id: 'tool-safety', label: 'Safe, approval-required and blocked actions', surface: 'desktop', status: 'available', safety: 'central-policy-gate' },
  { id: 'cloud-memory-sync', label: 'Cross-device cloud memory sync', surface: 'cloud', status: 'planned', safety: 'requires-identity-and-conflict-resolution' },
  { id: 'cloud-scheduler', label: '24/7 cloud scheduled agents', surface: 'cloud', status: 'planned', safety: 'requires-durable-queue-and-worker-host' },
  { id: 'cloud-browser', label: 'Hosted browser and remote computer', surface: 'cloud', status: 'planned', safety: 'requires-isolated-browser-and-per-action-approval' },
  { id: 'account-connectors', label: 'Managed OAuth app connections', surface: 'cloud', status: 'planned', safety: 'requires-trusted-oauth-provider' },
  { id: 'multi-device-runtime', label: 'Multi-device synchronized agent runtime', surface: 'cloud', status: 'planned', safety: 'requires-database-and-device-presence' },
]);

export function getApexCapabilities({ surface } = {}) {
  return APEX_CAPABILITIES
    .filter((item) => !surface || item.surface === surface)
    .map((item) => ({ ...item }));
}
