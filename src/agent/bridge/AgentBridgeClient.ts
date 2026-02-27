import type { AgentTask } from '../types';
import type { AgentProtocolEvent } from '../protocol';

export type BridgeEventListener = (event: AgentProtocolEvent) => void;

export interface AgentBridgeClient {
  connect(): Promise<void>;
  disconnect(): void;
  publishTask(task: AgentTask): Promise<void>;
  subscribeEvents(listener: BridgeEventListener): () => void;
}
