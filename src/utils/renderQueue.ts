// Strict priority-ordered, cancellation-aware render semaphore (max 2 simultaneous renders)
export const MAX_CONCURRENT_RENDERS = 2;

export interface RenderWaiter {
  getPriority: () => number;
  isCancelled: () => boolean;
  wake: (acquired: boolean) => void;
}

export class RenderQueue {
  private activeRenders = 0;
  private waiters: RenderWaiter[] = [];
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = MAX_CONCURRENT_RENDERS) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  getActiveCount(): number {
    return this.activeRenders;
  }

  private pump(): void {
    while (this.activeRenders < this.maxConcurrent && this.waiters.length > 0) {
      // Prune cancelled entries first so scrolled-past pages never block visible pages
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].isCancelled()) {
          const [dropped] = this.waiters.splice(i, 1);
          dropped.wake(false);
        }
      }
      if (this.waiters.length === 0) break;

      let bestIdx = 0;
      let bestPriority = this.waiters[0].getPriority();
      for (let i = 1; i < this.waiters.length; i++) {
        const p = this.waiters[i].getPriority();
        if (p < bestPriority) {
          bestPriority = p;
          bestIdx = i;
        }
      }

      const [next] = this.waiters.splice(bestIdx, 1);
      // Reserve slot synchronously BEFORE waking waiter microtask
      this.activeRenders += 1;
      next.wake(true);
    }
  }

  async schedule<T>(
    getPriority: () => number,
    isCancelled: () => boolean,
    task: () => Promise<T>
  ): Promise<T | undefined> {
    if (isCancelled()) return undefined;

    if (this.activeRenders < this.maxConcurrent) {
      this.activeRenders += 1;
    } else {
      const acquired = await new Promise<boolean>((resolve) => {
        this.waiters.push({ getPriority, isCancelled, wake: resolve });
      });
      if (!acquired) return undefined;
      if (isCancelled()) {
        this.activeRenders = Math.max(0, this.activeRenders - 1);
        this.pump();
        return undefined;
      }
    }

    try {
      return await task();
    } finally {
      this.activeRenders = Math.max(0, this.activeRenders - 1);
      this.pump();
    }
  }
}

export const defaultRenderQueue = new RenderQueue(MAX_CONCURRENT_RENDERS);

export function schedulePageRender<T>(
  getPriority: () => number,
  isCancelled: () => boolean,
  task: () => Promise<T>
): Promise<T | undefined> {
  return defaultRenderQueue.schedule(getPriority, isCancelled, task);
}

export function withRenderSlot<T>(task: () => Promise<T>): Promise<T | undefined> {
  return schedulePageRender(() => 0, () => false, task);
}
