import type { AgentBridgeClient, BridgeEventListener } from '../AgentBridgeClient';
import type {
  AgentCognitionContext,
  AgentCognitionPayload,
  AgentDialogueContext,
  AgentDialogueLine,
  AgentTask,
} from '../../types';
import { createProtocolEvent } from '../../protocol';

const MOCK_AGENT_IDS = ['npc1', 'npc2', 'npc3', 'npc4', 'npc5', 'npc6', 'npc7', 'npc8'];

export class MockProvider implements AgentBridgeClient {
  private listeners = new Set<BridgeEventListener>();
  private connected = false;
  private timers: number[] = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
  }

  subscribeEvents(listener: BridgeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publishTask(task: AgentTask): Promise<void> {
    if (!this.connected) {
      throw new Error('Mock provider is not connected');
    }

    const agentId = MOCK_AGENT_IDS[Math.floor(Math.random() * MOCK_AGENT_IDS.length)];
    this.emitWithDelay(200, createProtocolEvent('AGENT_MEMORY', {
      taskId: task.id,
      agentId,
      summary: 'Task system is disabled in life-sim mode',
      memory: {
        id: `mem_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
        agentId,
        taskId: task.id,
        timestamp: Date.now(),
        kind: 'observation',
        content: `Ignored task "${task.title}" in life-sim mode`,
        importance: 0.35,
      },
    }));
  }

  async requestCognition(context: AgentCognitionContext): Promise<AgentCognitionPayload | null> {
    void context;
    if (!this.connected) {
      return null;
    }
    return null;
  }

  async requestDialogueLine(context: AgentDialogueContext): Promise<AgentDialogueLine | null> {
    void context;
    if (!this.connected) return null;
    return null;
  }

  private emitWithDelay(delayMs: number, event: ReturnType<typeof createProtocolEvent>): void {
    const timer = window.setTimeout(() => {
      if (!this.connected) {
        return;
      }
      this.listeners.forEach((listener) => listener(event));
    }, delayMs);
    this.timers.push(timer);
  }
}
