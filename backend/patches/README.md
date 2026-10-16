# Observe collector compatibility

`@nestjs/observe` 0.3.6 deletes the snapshot trace array (`t`) when the collector
signals degraded ingestion. The collector rejects these batches with
`snapshots.N.t must be an array`. Version 0.3.7 retains the same behavior.

The patch sends `t: []` for withheld request and job spans, preserving the
truncation count, snapshot metadata, and slow/error traces. The SDK is pinned
while this patch is needed. `patch-package` is a production dependency because
both Docker stages apply the patch through `postinstall`, including `--omit=dev`.

It also logs the free-plan included-events 429 as a warning rather than an error.
The SDK already pauses sends for its rate-limit window and drops batches during
that time; other collector failures still log as errors.

Run `npm run test:observe` to check the installed SDK's actual serialized payloads.
The check also runs before `npm test`; it uses Node's test runner because the SDK
is ESM. No database, network, or Observe credentials are needed.

Remove the patch and version pin when an upstream release retains an array during
degradation, then rerun the regression check before upgrading.

## Cronitor ping logging

`cronitor` 2.6.1 prints rejected pings with `console.error(error)` before
returning `false`. `CronitorService` already logs that return value as a warning
and allows the job to continue. The patch removes the duplicate error and stack
trace without changing ping behavior. `cronitor-client.spec.ts` verifies this
against the installed SDK.
