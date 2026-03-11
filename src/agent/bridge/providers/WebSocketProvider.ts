import type { AgentBridgeClient, BridgeEventListener } from '../AgentBridgeClient';
import type {
  AgentCognitionContext,
  AgentCognitionPayload,
  AgentConversationOutcomeContext,
  AgentConversationOutcomePayload,
  AgentDailyPlanContext,
  AgentDailyPlanPayload,
  AgentTask,
} from '../../types';
import type { AgentProtocolEvent } from '../../protocol';

interface WebSocketProviderOptions {
  wsUrl: string;
}

export class WebSocketProvider implements AgentBridgeClient {
  private listeners = new Set<BridgeEventListener>();
  private socket?: WebSocket;
  private wsUrl: string;

  constructor(options: WebSocketProviderOptions) {
    this.wsUrl = options.wsUrl;
  }

  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(this.wsUrl);
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error(`Failed to connect to ${this.wsUrl}`));
      this.socket.onmessage = (message) => this.handleMessage(message.data);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }

  subscribeEvents(listener: BridgeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publishTask(task: AgentTask): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket bridge is not connected');
    }

    this.socket.send(JSON.stringify({
      type: 'PUBLISH_TASK',
      task,
    }));
  }

  async requestCognition(_context: AgentCognitionContext): Promise<AgentCognitionPayload | null> {
    // Current websocket bridge path is task-oriented; cognition requests use RelayProvider in MVP.
    return null;
  }

  async requestDailyPlan(_context: AgentDailyPlanContext): Promise<AgentDailyPlanPayload | null> {
    return null;
  }

  async requestConversationOutcome(
    _context: AgentConversationOutcomeContext,
  ): Promise<AgentConversationOutcomePayload | null> {
    return null;
  }

  private handleMessage(rawData: unknown): void {
    if (typeof rawData !== 'string') {
      return;
    }

    try {
      const parsed = JSON.parse(rawData) as AgentProtocolEvent;
      if (!parsed || typeof parsed.type !== 'string' || typeof parsed.taskId !== 'string') {
        return;
      }
      this.listeners.forEach((listener) => listener(parsed));
    } catch {
      // Ignore malformed external messages.
    }
  }
}
