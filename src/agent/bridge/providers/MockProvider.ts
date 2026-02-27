import type { AgentBridgeClient, BridgeEventListener } from '../AgentBridgeClient';
import type { AgentTask } from '../../types';
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

    this.emitWithDelay(250, createProtocolEvent('TASK_ASSIGNED', {
      taskId: task.id,
      task,
      agentId,
      summary: `${agentId} picked up "${task.title}"`,
    }));
    this.emitWithDelay(1200, createProtocolEvent('AGENT_THINKING', {
      taskId: task.id,
      agentId,
      summary: 'Analyzing task requirements',
    }));
    this.emitWithDelay(1550, createProtocolEvent('AGENT_MEMORY', {
      taskId: task.id,
      agentId,
      summary: 'Recalled similar memory: prior task delivery in dorm corridor',
      memory: {
        id: `mem_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
        agentId,
        taskId: task.id,
        timestamp: Date.now(),
        kind: 'observation',
        content: `Task context for "${task.title}" appears similar to previous request`,
        importance: 0.62,
      },
    }));
    this.emitWithDelay(1900, createProtocolEvent('AGENT_PLAN', {
      taskId: task.id,
      agentId,
      summary: 'Built short-horizon plan',
      plan: {
        id: `plan_${task.id}`,
        agentId,
        taskId: task.id,
        goal: task.prompt,
        status: 'active',
        updatedAt: Date.now(),
        steps: [
          { id: 's1', text: 'Gather context' },
          { id: 's2', text: 'Execute key tool calls' },
          { id: 's3', text: 'Summarize and return result' },
        ],
      },
    }));
    this.emitWithDelay(2300, createProtocolEvent('AGENT_TOOL_CALL', {
      taskId: task.id,
      agentId,
      summary: 'Running tool: read repo + plan steps',
    }));
    this.emitWithDelay(3600, createProtocolEvent('AGENT_RESULT', {
      taskId: task.id,
      agentId,
      summary: 'Draft complete, preparing delivery',
    }));
    this.emitWithDelay(4300, createProtocolEvent('TASK_DONE', {
      taskId: task.id,
      agentId,
      summary: 'Task delivered successfully',
    }));
    this.emitWithDelay(4700, createProtocolEvent('AGENT_REFLECTION', {
      taskId: task.id,
      agentId,
      summary: 'Reflection: clearer task decomposition improved turnaround',
      memory: {
        id: `mem_reflect_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
        agentId,
        taskId: task.id,
        timestamp: Date.now(),
        kind: 'reflection',
        content: 'Use explicit decomposition for similar tasks',
        importance: 0.78,
      },
    }));
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
