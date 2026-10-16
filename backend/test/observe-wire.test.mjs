import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObserveAgentSharedBuffer } from '../node_modules/@nestjs/observe/dist/agent/observe-agent.shared-buffer.js';
import { ObserveAgentWorker } from '../node_modules/@nestjs/observe/dist/agent/observe-agent.worker.js';

// Exercise the installed ESM SDK and its serialized payload, without credentials
// or a live collector. The collector requires t to remain an array.
const traces = [
  { name: 'parent', duration: 10, children: [{ name: 'child', duration: 5 }] },
];

function readPayload(buffer) {
  buffer.encodeAndWrite();
  const length = new DataView(buffer.sharedBuffer, 4, 4).getUint32(0);
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer.sharedBuffer, 8, length)),
  );
}

for (const { kind, insert, collection, snapshot, failure } of [
  {
    kind: 'request',
    insert: 'insertRequestSnapshot',
    collection: 'snapshots',
    snapshot: {
      traceId: 'local-request',
      operationId: '/stations',
      protocol: 'http',
      attributes: { method: 'GET', statusCode: 200 },
    },
    failure: { attributes: { method: 'GET', statusCode: 500 } },
  },
  {
    kind: 'job',
    insert: 'insertJobSnapshot',
    collection: 'jobs',
    snapshot: {
      id: 'local-job',
      traceId: 'local-job-trace',
      name: 'scheduled-check',
      status: 'completed',
    },
    failure: { status: 'failed', error: { message: 'test failure' } },
  },
]) {
  for (const { name, degraded, extra = {}, withheld } of [
    { name: 'normal', degraded: false, withheld: false },
    { name: 'degraded', degraded: true, withheld: true },
    {
      name: 'slow during degradation',
      degraded: true,
      extra: { duration: 1001 },
      withheld: false,
    },
    {
      name: 'failed during degradation',
      degraded: true,
      extra: failure,
      withheld: false,
    },
  ]) {
    test(`${kind}: ${name} sends a valid trace array`, () => {
      const buffer = new ObserveAgentSharedBuffer({ serviceId: 'local-test' });
      buffer.setDegraded(degraded);
      buffer[insert]({ ...snapshot, duration: 10, traces, ...extra });

      const payload = readPayload(buffer);
      const encoded = payload[collection][0];
      assert.ok(Array.isArray(encoded.t), `${collection}.0.t must be an array`);
      assert.equal(encoded.t.length, withheld ? 0 : 1);
      assert.equal(payload.truncatedSpans ?? 0, withheld ? 2 : 0);
      assert.equal(encoded.ti, snapshot.traceId);
      if (!withheld) {
        assert.equal(encoded.t[0].ch[0].n, 'child');
      }
    });
  }

  test(`${kind}: spans resume when degradation clears`, () => {
    const buffer = new ObserveAgentSharedBuffer({ serviceId: 'local-test' });
    buffer.setDegraded(true);
    buffer[insert]({ ...snapshot, duration: 10, traces });
    buffer.setDegraded(false);
    buffer[insert]({ ...snapshot, duration: 10, traces });

    const payload = readPayload(buffer);
    assert.deepEqual(payload[collection][0].t, []);
    assert.equal(payload[collection][1].t[0].ch[0].n, 'child');
    assert.equal(payload.truncatedSpans, 2);
  });
}

test('quota 429 is a warning; other collector failures remain errors', () => {
  const warnings = [];
  const errors = [];
  const worker = {
    logger: {
      warn: (message) => warnings.push(message),
      error: (message) => errors.push(message),
    },
  };
  const quota =
    'Error: Telemetry rate-limited (429) - the account has used its included events for this period (600,022 of 300,000 included events used on the free plan)';
  const other =
    'Error: Telemetry rate-limited (429) - request rate cap exceeded';

  ObserveAgentWorker.prototype.handleMessage.call(worker, quota);
  ObserveAgentWorker.prototype.handleMessage.call(worker, other);

  assert.deepEqual(warnings, [quota.slice('Error: '.length)]);
  assert.deepEqual(errors, [other]);
});
