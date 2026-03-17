import type { AgentTask } from '../../types';
import type { AgentProtocolEvent } from '../../protocol';
import type { OpenClawBridgeClient, OpenClawEventListener } from '../OpenClawBridgeClient';

interface OpenClawWebSocketProviderOptions {
  wsUrl: string;
}

export class OpenClawWebSocketProvider implements OpenClawBridgeClient {
  private readonly listeners = new Set<OpenClawEventListener>();
  private socket?: WebSocket;
  private readonly wsUrl: string;

  constructor(options: OpenClawWebSocketProviderOptions) {
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
    if (!this.socket) return;
    this.socket.close();
    this.socket = undefined;
  }

  async publishTask(task: AgentTask): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('OpenClaw WebSocket bridge is not connected');
    }
    this.socket.send(JSON.stringify({
      type: 'PUBLISH_TASK',
      task,
    }));
  }

  subscribeEvents(listener: OpenClawEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleMessage(rawData: unknown): void {
    if (typeof rawData !== 'string') return;
    try {
      const parsed = JSON.parse(rawData) as AgentProtocolEvent;
      if (!parsed || typeof parsed.type !== 'string' || typeof parsed.taskId !== 'string') return;
      this.listeners.forEach((listener) => listener(parsed));
    } catch {
      // Ignore malformed external messages.
    }
  }
}
