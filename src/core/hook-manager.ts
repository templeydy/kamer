import type { HookHandler, HookEvent, HookResult, HookEventType, HookContext } from './types';
import { HOOK_EXIT } from './types';

export class HookManager {
  private handlers: Map<HookEventType, HookHandler[]> = new Map();

  register(eventType: HookEventType, handler: HookHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  unregister(eventType: HookEventType, handler: HookHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, existing.filter(h => h !== handler));
  }

  async run(eventType: HookEventType, context: HookContext, event: HookEvent): Promise<HookResult> {
    const handlers = this.handlers.get(eventType) || [];

    let result: HookResult = { allowed: true, exitCode: HOOK_EXIT.CONTINUE };

    for (const handler of handlers) {
      try {
        const hookResult = await handler(event, context);

        if (!hookResult.allowed) {
          return hookResult;
        }

        if (hookResult.exitCode !== undefined && hookResult.exitCode > (result.exitCode ?? HOOK_EXIT.CONTINUE)) {
          result = hookResult;
        }
      } catch (e) {
        console.error(`Hook error in ${eventType}:`, e);
      }
    }

    return result;
  }

  clear(): void {
    this.handlers.clear();
  }
}

// ============================================
// Built-in Hooks
// ============================================

export function createDangerousToolBlocker(blockedTools: string[]): HookHandler {
  return async (event: HookEvent) => {
    if (event.type === 'PreToolUse' && blockedTools.includes(event.toolName)) {
      return {
        allowed: false,
        exitCode: HOOK_EXIT.ABORT,
        message: `Tool ${event.toolName} is blocked by security policy`,
      };
    }
    return { allowed: true };
  };
}

export function createToolLogger(): HookHandler {
  return async (event: HookEvent, context: HookContext) => {
    console.log(`[HOOK] ${event.type}: ${event.toolName} by ${context.userId} (iteration ${context.iteration})`);
    return { allowed: true };
  };
}

export function createArgsModifier(modifier: (toolName: string, args: Record<string, any>) => Record<string, any>): HookHandler {
  return async (event: HookEvent) => {
    if (event.type === 'PreToolUse') {
      return {
        allowed: true,
        exitCode: HOOK_EXIT.CONTINUE,
        modifiedArgs: modifier(event.toolName, event.toolArgs),
      };
    }
    return { allowed: true };
  };
}