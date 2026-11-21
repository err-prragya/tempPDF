import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderQueue } from './renderQueue';

function deferred<T = void>() {
  let resolve!: (val: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test('RenderQueue strictly caps concurrent tasks and reserves slots synchronously', async () => {
  const queue = new RenderQueue(2);
  let running = 0;
  let maxObserved = 0;
  const gates = [deferred(), deferred(), deferred(), deferred(), deferred()];
  const executionOrder: number[] = [];

  const promises = gates.map((gate, idx) =>
    queue.schedule(
      () => idx,
      () => false,
      async () => {
        running += 1;
        maxObserved = Math.max(maxObserved, running);
        executionOrder.push(idx);
        await gate.promise;
        running -= 1;
        return idx;
      }
    )
  );

  // Immediately after scheduling 5 tasks, at most 2 are running
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(maxObserved, 2);
  assert.equal(running, 2);
  assert.deepEqual(executionOrder, [0, 1]);

  // Complete first two tasks
  gates[0].resolve();
  gates[1].resolve();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(maxObserved, 2);
  assert.deepEqual(executionOrder, [0, 1, 2, 3]);

  gates[2].resolve();
  gates[3].resolve();
  gates[4].resolve();
  const results = await Promise.all(promises);
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
  assert.equal(queue.getActiveCount(), 0);
});

test('RenderQueue wakes lowest priority score first and skips cancelled waiters', async () => {
  const queue = new RenderQueue(1);
  const firstGate = deferred();
  const order: string[] = [];
  let cancelMiddle = false;

  const p1 = queue.schedule(
    () => 0,
    () => false,
    async () => {
      order.push('first');
      await firstGate.promise;
    }
  );

  const pLow = queue.schedule(
    () => 10,
    () => false,
    async () => {
      order.push('low-priority');
    }
  );

  const pCancelled = queue.schedule(
    () => 1,
    () => cancelMiddle,
    async () => {
      order.push('should-not-run');
    }
  );

  const pHigh = queue.schedule(
    () => 2,
    () => false,
    async () => {
      order.push('high-priority');
    }
  );

  cancelMiddle = true;
  firstGate.resolve();

  await Promise.all([p1, pLow, pCancelled, pHigh]);
  assert.deepEqual(order, ['first', 'high-priority', 'low-priority']);
  assert.equal(queue.getActiveCount(), 0);
});
