import type { AgentTask } from '../types';
import type { AgentProtocolEvent } from '../protocol';

export type OpenClawEventListener = (event: AgentProtocolEvent) => void;

export interface OpenClawBridgeClient {
  connect(): Promise<void>;
  disconnect(): void;
  publishTask(task: AgentTask): Promise<void>;
  subscribeEvents(listener: OpenClawEventListener): () => void;
}
