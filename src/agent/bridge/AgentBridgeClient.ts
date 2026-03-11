import type {
  AgentCognitionContext,
  AgentCognitionPayload,
  AgentConversationOutcomeContext,
  AgentConversationOutcomePayload,
  AgentDailyPlanContext,
  AgentDailyPlanPayload,
  AgentDialogueContext,
  AgentDialogueLine,
  AgentTask,
} from '../types';
import type { AgentProtocolEvent } from '../protocol';

export type BridgeEventListener = (event: AgentProtocolEvent) => void;

export interface AgentBridgeClient {
  connect(): Promise<void>;
  disconnect(): void;
  publishTask(task: AgentTask): Promise<void>;
  requestCognition?(context: AgentCognitionContext): Promise<AgentCognitionPayload | null>;
  requestDialogueLine?(context: AgentDialogueContext): Promise<AgentDialogueLine | null>;
  requestDailyPlan?(context: AgentDailyPlanContext): Promise<AgentDailyPlanPayload | null>;
  requestConversationOutcome?(
    context: AgentConversationOutcomeContext,
  ): Promise<AgentConversationOutcomePayload | null>;
  subscribeEvents(listener: BridgeEventListener): () => void;
}
