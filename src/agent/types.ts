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
  appraisal?: {
    kind?: 'conflict' | 'support' | 'social_contact' | 'task_success' | 'task_failure' | 'reflection' | 'observation';
    affect?: number; // -1..1
    importance?: number; // 0..1
    confidence?: number; // 0..1
    targetAgentId?: AgentId;
    where?: string;
  };
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
  turnIndex?: number;
  depth?: 'smalltalk' | 'deep';
  cause?: 'proximity' | 'memory' | 'schedule' | 'authority' | 'task' | 'other';
  priority?: number; // higher means more important channel
  dedupeKey?: string;
}

export type AgentPlanIntentAction =
  | 'stay'
  | 'talk'
  | 'shift_activity'
  | 'reflect';

export interface AgentPlanIntent {
  action: AgentPlanIntentAction;
  activity?: string;
  targetAgentId?: AgentId;
  roomId?: string;
  reason?: string;
  urgency?: number; // 0..1
}

export interface AgentCognitionPayload {
  thoughtText: string;
  dialogueText?: string;
  planIntent: AgentPlanIntent;
  confidence?: number; // 0..1
  priority?: number; // 0..1
}

export interface AgentCognitionContext {
  agentId: AgentId;
  gameTime: {
    day: number;
    weekdayName: string;
    hours: number;
    minutes: number;
  };
  runtime: {
    state: AgentRuntimeState;
    statusText: string;
    currentActivity: string;
    currentRoomId?: string;
    nearbyAgents: Array<{ id: AgentId; name: string; distanceTiles: number }>;
    needs?: {
      energy: number;
      hunger: number;
      socialNeed: number;
      noveltyNeed: number;
      stress: number;
    };
    degradedMode?: boolean;
  };
  memory: {
    recentThoughts: string[];
    episodicSummary: string[];
    retrievedMemories?: Array<{
      kind: string;
      who: string;
      where: string;
      affect: number;
      importance: number;
      score: number;
    }>;
  };
  relationships: Array<{ otherId: AgentId; affinity: number }>;
  narratives: Array<{ id: string; text: string; confidence: number; dominance: number }>;
}

export interface AgentDialogueContext {
  speakerId: AgentId;
  listenerId: AgentId;
  depth: 'smalltalk' | 'deep';
  turnIndex: number;
  gameTime: AgentCognitionContext['gameTime'];
  place?: string;
  relationshipAffinity: number;
  speakerNarratives: AgentCognitionContext['narratives'];
  speakerNeeds?: AgentCognitionContext['runtime']['needs'];
  retrievedMemories?: AgentCognitionContext['memory']['retrievedMemories'];
  previousLines: Array<{ speakerId: AgentId; text: string }>;
  styleHints?: {
    tone?: string;
    avoidTopics?: string[];
    signaturePhrases?: string[];
  };
  semantic?: {
    relationshipStage?: 'stranger' | 'familiar' | 'friendly' | 'close' | 'tense' | 'hostile';
    speakerNeedsLevel?: {
      energy: 'low' | 'mid' | 'high';
      stress: 'low' | 'mid' | 'high';
      socialNeed: 'low' | 'mid' | 'high';
      noveltyNeed: 'low' | 'mid' | 'high';
      hunger: 'low' | 'mid' | 'high';
    };
    listenerNeedsLevel?: {
      energy: 'low' | 'mid' | 'high';
      stress: 'low' | 'mid' | 'high';
      socialNeed: 'low' | 'mid' | 'high';
      noveltyNeed: 'low' | 'mid' | 'high';
      hunger: 'low' | 'mid' | 'high';
    };
    speakerActivity?: string;
    listenerActivity?: string;
    sharedRecentTopics?: string[];
    promptFocus?: string;
  };
}

export interface AgentDialogueLine {
  text: string;
}

export interface AgentDailyPlanWindow {
  startMinute: number;
  endMinute: number;
}

export interface AgentDailyPlanBlock extends AgentDailyPlanWindow {
  activity: string;
  roomId?: string;
  focus: string;
  commitment?: number; // 0..1
  reason?: string;
}

export interface AgentDailyPlanContext {
  agentId: AgentId;
  gameTime: {
    day: number;
    weekdayIndex: number;
    weekdayName: string;
  };
  runtime: {
    currentActivity: string;
    currentRoomId?: string;
    needs?: AgentCognitionContext['runtime']['needs'];
  };
  homeRoomId?: string;
  windows: AgentDailyPlanWindow[];
  allowedActivities: string[];
  roomHints?: Record<string, string[]>;
  relationships: AgentCognitionContext['relationships'];
  narratives: AgentCognitionContext['narratives'];
  retrievedMemories?: AgentCognitionContext['memory']['retrievedMemories'];
}

export interface AgentDailyPlanPayload {
  day: number;
  blocks: AgentDailyPlanBlock[];
  source?: 'llm' | 'fallback';
  reason?: string;
}

export interface AgentConversationOutcomeContext {
  conversationId: string;
  depth: 'smalltalk' | 'deep';
  cause: 'proximity' | 'memory' | 'schedule' | 'authority' | 'task' | 'other';
  speakerAId: AgentId;
  speakerBId: AgentId;
  relationshipAB: number;
  relationshipBA: number;
  place?: string;
  gameTime: AgentCognitionContext['gameTime'];
  recentLines: Array<{ speakerId: AgentId; text: string }>;
  speakerANeeds?: AgentCognitionContext['runtime']['needs'];
  speakerBNeeds?: AgentCognitionContext['runtime']['needs'];
  retrievedMemoriesA?: AgentCognitionContext['memory']['retrievedMemories'];
  retrievedMemoriesB?: AgentCognitionContext['memory']['retrievedMemories'];
}

export interface AgentConversationOutcomePayload {
  relationshipDeltas: Array<{
    fromId: AgentId;
    toId: AgentId;
    delta: number; // bounded by server normalizer
    reason?: string;
  }>;
  memoryAppraisals: Array<{
    agentId: AgentId;
    targetAgentId: AgentId;
    kind: 'conflict' | 'support' | 'social_contact' | 'task_success' | 'task_failure' | 'reflection' | 'observation';
    affect: number; // -1..1
    importance: number; // 0..1
    confidence?: number; // 0..1
    summary?: string;
    content?: string;
    where?: string;
  }>;
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
  currentActivity?: string;
  taskId?: TaskId;
  cooldownProgress?: number;
  debugMetrics?: {
    replanCount: number;
    stuckCount: number;
    fallbackCount: number;
  };
}
