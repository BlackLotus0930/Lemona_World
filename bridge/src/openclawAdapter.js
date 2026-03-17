import crypto from 'node:crypto';

export function createProtocolEvent(type, payload) {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    ...payload,
  };
}

export function mapOpenClawWebhookToEvents(payload) {
  const taskId = String(payload?.taskId ?? 'unknown');
  const agentId = payload?.agentId ? String(payload.agentId) : undefined;
  const summary = payload?.summary ? String(payload.summary) : undefined;

  switch (payload?.type) {
    case 'task.assigned':
      return [createProtocolEvent('TASK_ASSIGNED', { taskId, agentId, summary })];
    case 'agent.thinking':
      return [createProtocolEvent('AGENT_THINKING', { taskId, agentId, summary })];
    case 'agent.tool_call':
      return [createProtocolEvent('AGENT_TOOL_CALL', { taskId, agentId, summary })];
    case 'agent.result':
      return [createProtocolEvent('AGENT_RESULT', { taskId, agentId, summary })];
    case 'agent.memory':
      return [createProtocolEvent('AGENT_MEMORY', {
        taskId,
        agentId,
        summary,
        memory: payload?.memory,
      })];
    case 'agent.plan':
      return [createProtocolEvent('AGENT_PLAN', {
        taskId,
        agentId,
        summary,
        plan: payload?.plan,
      })];
    case 'agent.reflection':
      return [createProtocolEvent('AGENT_REFLECTION', {
        taskId,
        agentId,
        summary,
        memory: payload?.memory,
      })];
    case 'agent.dialogue':
      return [createProtocolEvent('AGENT_DIALOGUE', {
        taskId,
        agentId,
        summary,
        dialogue: payload?.dialogue,
      })];
    case 'agent.conversation_start':
      return [createProtocolEvent('AGENT_CONVERSATION_START', {
        taskId,
        agentId,
        summary,
        dialogue: payload?.dialogue,
      })];
    case 'agent.conversation_end':
      return [createProtocolEvent('AGENT_CONVERSATION_END', {
        taskId,
        agentId,
        summary,
        dialogue: payload?.dialogue,
      })];
    case 'task.done':
      return [createProtocolEvent('TASK_DONE', { taskId, agentId, summary })];
    case 'task.failed':
      return [createProtocolEvent('TASK_FAILED', {
        taskId,
        agentId,
        summary,
        error: payload?.error ? String(payload.error) : 'Task failed',
      })];
    default:
      return [];
  }
}

export function createSimulatedRunEvents(task, agentId) {
  const taskId = task.id;
  const title = task.title ?? 'Untitled task';
  return [
    {
      delayMs: 200,
      event: createProtocolEvent('TASK_ASSIGNED', {
        taskId,
        agentId,
        summary: `${agentId} picked up "${title}"`,
      }),
    },
    {
      delayMs: 1200,
      event: createProtocolEvent('AGENT_THINKING', {
        taskId,
        agentId,
        summary: 'Interpreting user goal and planning steps',
      }),
    },
    {
      delayMs: 1700,
      event: createProtocolEvent('AGENT_MEMORY', {
        taskId,
        agentId,
        summary: 'Recalled prior memory relevant to this request',
        memory: {
          id: `mem_${taskId}`,
          agentId,
          taskId,
          timestamp: Date.now(),
          kind: 'observation',
          content: `Prior execution context for ${title}`,
          importance: 0.6,
        },
      }),
    },
    {
      delayMs: 2100,
      event: createProtocolEvent('AGENT_PLAN', {
        taskId,
        agentId,
        summary: 'Generated a short plan',
        plan: {
          id: `plan_${taskId}`,
          agentId,
          taskId,
          goal: task.prompt ?? title,
          status: 'active',
          updatedAt: Date.now(),
          steps: [
            { id: 'step1', text: 'Understand task' },
            { id: 'step2', text: 'Execute tools' },
            { id: 'step3', text: 'Produce final result' },
          ],
        },
      }),
    },
    {
      delayMs: 2600,
      event: createProtocolEvent('AGENT_TOOL_CALL', {
        taskId,
        agentId,
        summary: 'OpenClaw is executing tools',
      }),
    },
    {
      delayMs: 4200,
      event: createProtocolEvent('AGENT_RESULT', {
        taskId,
        agentId,
        summary: 'Result generated and packaged for handoff',
      }),
    },
    {
      delayMs: 5000,
      event: createProtocolEvent('TASK_DONE', {
        taskId,
        agentId,
        summary: 'Task completed',
      }),
    },
    {
      delayMs: 5600,
      event: createProtocolEvent('AGENT_REFLECTION', {
        taskId,
        agentId,
        summary: 'Reflection recorded for future planning',
        memory: {
          id: `mem_reflect_${taskId}`,
          agentId,
          taskId,
          timestamp: Date.now(),
          kind: 'reflection',
          content: 'This strategy improved completion speed',
          importance: 0.75,
        },
      }),
    },
  ];
}
