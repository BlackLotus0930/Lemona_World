import type { AgentBridgeClient, BridgeEventListener } from '../AgentBridgeClient';
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
} from '../../types';

interface RelayProviderOptions {
  baseUrl: string;
  cognitionPath?: string;
  dialoguePath?: string;
  dailyPlanPath?: string;
  conversationOutcomePath?: string;
  timeoutMs?: number;
  cognitionTimeoutMs?: number;
  dialogueTimeoutMs?: number;
  dailyPlanTimeoutMs?: number;
  conversationOutcomeTimeoutMs?: number;
  dialogueRetryCount?: number;
}

type CognitionResponse = {
  cognition?: AgentCognitionPayload;
};
type DialogueResponse = {
  line?: AgentDialogueLine;
};
type DailyPlanResponse = {
  plan?: AgentDailyPlanPayload;
};
type ConversationOutcomeResponse = {
  outcome?: AgentConversationOutcomePayload;
};

export class RelayProvider implements AgentBridgeClient {
  private listeners = new Set<BridgeEventListener>();
  private connected = false;
  private readonly baseUrl: string;
  private readonly cognitionPath: string;
  private readonly dialoguePath: string;
  private readonly dailyPlanPath: string;
  private readonly conversationOutcomePath: string;
  private readonly cognitionTimeoutMs: number;
  private readonly dialogueTimeoutMs: number;
  private readonly dailyPlanTimeoutMs: number;
  private readonly conversationOutcomeTimeoutMs: number;
  private readonly dialogueRetryCount: number;

  constructor(options: RelayProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.cognitionPath = options.cognitionPath ?? '/npc/cognition';
    this.dialoguePath = options.dialoguePath ?? '/npc/dialogue';
    this.dailyPlanPath = options.dailyPlanPath ?? '/npc/daily-plan';
    this.conversationOutcomePath = options.conversationOutcomePath ?? '/npc/conversation-outcome';
    const sharedTimeout = Math.max(1200, options.timeoutMs ?? 4500);
    this.cognitionTimeoutMs = Math.max(1200, options.cognitionTimeoutMs ?? sharedTimeout);
    this.dialogueTimeoutMs = Math.max(1000, options.dialogueTimeoutMs ?? Math.min(sharedTimeout, 3600));
    this.dailyPlanTimeoutMs = Math.max(2200, options.dailyPlanTimeoutMs ?? Math.max(sharedTimeout, 12_000));
    this.conversationOutcomeTimeoutMs = Math.max(1800, options.conversationOutcomeTimeoutMs ?? Math.max(sharedTimeout, 7000));
    this.dialogueRetryCount = Math.max(0, Math.min(2, Math.floor(options.dialogueRetryCount ?? 1)));
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  subscribeEvents(listener: BridgeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publishTask(task: AgentTask): Promise<void> {
    if (!this.connected) {
      throw new Error('Relay provider is not connected');
    }
    const url = `${this.baseUrl}/tasks/publish`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    });
    if (!response.ok) {
      throw new Error(`Relay task publish failed: ${response.status}`);
    }
  }

  async requestCognition(context: AgentCognitionContext): Promise<AgentCognitionPayload | null> {
    if (!this.connected) {
      return null;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.cognitionTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${this.cognitionPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const parsed = (await response.json()) as CognitionResponse;
      const cognition = parsed?.cognition;
      if (!cognition || typeof cognition.thoughtText !== 'string' || !cognition.planIntent) {
        return null;
      }
      return cognition;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async requestDialogueLine(context: AgentDialogueContext): Promise<AgentDialogueLine | null> {
    if (!this.connected) {
      return null;
    }
    for (let attempt = 0; attempt <= this.dialogueRetryCount; attempt += 1) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), this.dialogueTimeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${this.dialoguePath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context }),
          signal: controller.signal,
        });
        if (!response.ok) {
          if (attempt < this.dialogueRetryCount) continue;
          return null;
        }
        const parsed = (await response.json()) as DialogueResponse;
        const line = parsed?.line;
        if (!line || typeof line.text !== 'string' || !line.text.trim()) {
          if (attempt < this.dialogueRetryCount) continue;
          return null;
        }
        return { text: line.text.trim().slice(0, 180) };
      } catch {
        if (attempt >= this.dialogueRetryCount) {
          return null;
        }
      } finally {
        window.clearTimeout(timer);
      }
    }
    return null;
  }

  async requestDailyPlan(context: AgentDailyPlanContext): Promise<AgentDailyPlanPayload | null> {
    if (!this.connected) {
      return null;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.dailyPlanTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${this.dailyPlanPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const parsed = (await response.json()) as DailyPlanResponse;
      const plan = parsed?.plan;
      if (!plan || !Array.isArray(plan.blocks) || typeof plan.day !== 'number') {
        return null;
      }
      return plan;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async requestConversationOutcome(
    context: AgentConversationOutcomeContext,
  ): Promise<AgentConversationOutcomePayload | null> {
    if (!this.connected) {
      return null;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), this.conversationOutcomeTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${this.conversationOutcomePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const parsed = (await response.json()) as ConversationOutcomeResponse;
      const outcome = parsed?.outcome;
      if (!outcome || !Array.isArray(outcome.relationshipDeltas) || !Array.isArray(outcome.memoryAppraisals)) {
        return null;
      }
      return outcome;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }
}

