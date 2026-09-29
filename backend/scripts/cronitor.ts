import 'dotenv/config';
import {
  cronitorEnvironment,
  cronitorMonitorDefinitions,
} from '../src/monitoring/cronitor.config';
import { manageCronitor } from '../src/monitoring/cronitor-management';

async function main() {
  const action = process.argv[2] ?? 'plan';
  if (action === 'plan') {
    console.log(
      JSON.stringify(
        {
          environment: cronitorEnvironment(process.env),
          monitors: cronitorMonitorDefinitions(process.env),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (action !== 'status' && action !== 'sync')
    throw new Error('Usage: cronitor.ts plan|status|sync');
  console.log(
    JSON.stringify(await manageCronitor(action, process.env), null, 2),
  );
}

void main().catch((error: unknown) => {
  // The client strips API credentials from errors; never print Axios request/config objects.
  console.error(
    error instanceof Error ? error.message : 'Cronitor setup failed',
  );
  process.exitCode = 1;
});
