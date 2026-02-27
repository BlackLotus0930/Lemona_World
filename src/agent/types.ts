export type AgentId = string;
export type TaskId = string;

export type TaskStatus =
  | 'created'
  | 'assigned'
  | 'running'
  | 'done'
  | 'failed';

export type AgentRuntimeState =
  | 'idle_life'
  | 'moving_to_desk'
  | 'working'
  | 'returning_result'
  | 'cooldown';

export interface AgentMemoryEntry {
  id: string;
  agentId: AgentId;
  taskId?: TaskId;
  timestamp: number;
  kind: 'observation' | 'plan' | 'dialogue' | 'reflection' | 'result';
  content: string;
  importance: number;
}

export interface AgentPlanStep {
  id: string;
  text: string;
  done?: boolean;
}

export interface AgentPlan {
  id: string;
  agentId: AgentId;
  taskId?: TaskId;
  goal: string;
  steps: AgentPlanStep[];
  status: 'active' | 'completed' | 'failed';
  updatedAt: number;
}

export interface AgentDialoguePayload {
  speakerId: AgentId;
  listenerId?: AgentId;
  text: string;
  conversationId?: string;
}

export interface AgentRelationshipSnapshot {
  agentId: AgentId;
  otherAgentId: AgentId;
  affinity: number;
  lastInteractionAt?: number;
}

export interface AgentTask {
  id: TaskId;
  title: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  assignedAgentId?: AgentId;
  resultSummary?: string;
  errorMessage?: string;
}

export interface AgentStatusSnapshot {
  agentId: AgentId;
  agentName: string;
  state: AgentRuntimeState;
  statusText: string;
  taskId?: TaskId;
  cooldownProgress?: number;
  debugMetrics?: {
    replanCount: number;
    stuckCount: number;
    fallbackCount: number;
  };
}
