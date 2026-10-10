# Observe collector compatibility

`@nestjs/observe` 0.3.6 deletes the snapshot trace array (`t`) when the collector
signals degraded ingestion. The collector rejects these batches with
`snapshots.N.t must be an array`. Version 0.3.7 retains the same behavior.

The patch sends `t: []` for withheld request and job spans, preserving the
truncation count, snapshot metadata, and slow/error traces. The SDK is pinned
while this patch is needed. `patch-package` is a production dependency because
both Docker stages apply the patch through `postinstall`, including `--omit=dev`.

Run `npm run test:observe` to check the installed SDK's actual serialized payloads.
The check also runs before `npm test`; it uses Node's test runner because the SDK
is ESM. No database, network, or Observe credentials are needed.

Remove the patch and version pin when an upstream release retains an array during
degradation, then rerun the regression check before upgrading.
