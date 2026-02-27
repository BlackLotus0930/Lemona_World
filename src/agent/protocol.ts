import type {
  AgentDialoguePayload,
  AgentId,
  AgentMemoryEntry,
  AgentPlan,
  AgentRelationshipSnapshot,
  AgentTask,
  TaskId,
} from './types';

export type AgentProtocolEventType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'AGENT_THINKING'
  | 'AGENT_TOOL_CALL'
  | 'AGENT_RESULT'
  | 'TASK_DONE'
  | 'TASK_FAILED'
  | 'AGENT_MEMORY'
  | 'AGENT_PLAN'
  | 'AGENT_REFLECTION'
  | 'AGENT_CONVERSATION_START'
  | 'AGENT_DIALOGUE'
  | 'AGENT_CONVERSATION_END';

export interface AgentProtocolEvent {
  id: string;
  type: AgentProtocolEventType;
  timestamp: number;
  taskId: TaskId;
  agentId?: AgentId;
  summary?: string;
  task?: AgentTask;
  error?: string;
  memory?: AgentMemoryEntry;
  plan?: AgentPlan;
  dialogue?: AgentDialoguePayload;
  relationship?: AgentRelationshipSnapshot;
  metadata?: Record<string, unknown>;
}

export type EventListener = (event: AgentProtocolEvent) => void;

export class TaskEventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: AgentProtocolEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function createProtocolEvent(
  type: AgentProtocolEventType,
  payload: Omit<AgentProtocolEvent, 'id' | 'type' | 'timestamp'>,
): AgentProtocolEvent {
  const eventId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    id: eventId,
    type,
    timestamp: Date.now(),
    ...payload,
  };
}
