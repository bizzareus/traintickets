import { createCronitorClient, CronitorRequestError } from './cronitor-client';
import {
  cronitorEnvironment,
  cronitorMonitorDefinitions,
  type CronitorMonitorDefinition,
} from './cronitor.config';

type SavedMonitor = {
  key: string;
  type: string;
  name?: string;
  schedules?: string[];
  timezone?: string;
  assertions?: string[];
  initialized?: boolean;
  passing?: boolean | null;
  latest_event?: { stamp?: number; state?: string };
};

/** Control plane only: never send telemetry or run an application job from setup. */
export async function manageCronitor(
  action: 'status' | 'sync',
  env: NodeJS.ProcessEnv,
) {
  const key =
    env.CRONITOR_MANAGEMENT_API_KEY?.trim() || env.CRONITOR_API_KEY?.trim();
  if (!key)
    throw new Error(
      'Set CRONITOR_API_KEY (or CRONITOR_MANAGEMENT_API_KEY) in the environment first.',
    );
  const environment = cronitorEnvironment(env);
  const definitions = cronitorMonitorDefinitions(env);
  const { sdk, http } = createCronitorClient(key, environment, 10_000, true);
  const read = async (monitorKey: string): Promise<SavedMonitor | null> => {
    try {
      const response = await http.get<SavedMonitor>(
        sdk._api.monitorUrl(encodeURIComponent(monitorKey)),
        { params: { env: environment } },
      );
      if (response.data.key !== monitorKey)
        throw new Error(`Unexpected Cronitor response for ${monitorKey}`);
      return response.data;
    } catch (error) {
      if (error instanceof CronitorRequestError && error.status === 404)
        return null;
      throw error;
    }
  };

  // Inspect every intended key before the first write. Preserve unrelated monitors and routing.
  const existing = new Map<string, SavedMonitor | null>();
  for (const definition of definitions) {
    const monitor = await read(definition.key);
    if (monitor && monitor.type !== 'job')
      throw new Error(
        `Cronitor key ${definition.key} already belongs to a different monitor type`,
      );
    existing.set(definition.key, monitor);
  }

  const statuses: Array<{
    key: string;
    exists: boolean;
    initialized: boolean;
    passing: boolean | null;
    lastState?: string;
    lastEventAt?: number;
  }> = [];
  for (const definition of definitions) {
    let monitor = existing.get(definition.key) ?? null;
    if (action === 'sync') {
      const { name, note, ...managedFields } = definition;
      const desired: Omit<CronitorMonitorDefinition, 'name' | 'note'> & {
        name?: string;
        note?: string;
      } = {
        ...managedFields,
        assertions: [
          ...new Set([
            ...(monitor?.assertions ?? []),
            ...definition.assertions,
          ]),
        ],
        ...(!monitor ? { name, note } : {}),
      };
      // Stable-key PUT is idempotent; omit notify/group/paused so existing settings survive.
      await sdk.Monitor.put(desired);
      monitor = await read(definition.key);
      if (
        !monitor ||
        monitor.timezone !== definition.timezone ||
        JSON.stringify(monitor.schedules) !==
          JSON.stringify(definition.schedules) ||
        !desired.assertions.every((rule) => monitor!.assertions?.includes(rule))
      ) {
        throw new Error(
          `Cronitor configuration readback did not match for ${definition.key}`,
        );
      }
    }
    statuses.push({
      key: definition.key,
      exists: Boolean(monitor),
      initialized: monitor?.initialized === true,
      passing: monitor?.passing ?? null,
      lastState: monitor?.latest_event?.state,
      lastEventAt: monitor?.latest_event?.stamp,
    });
  }
  return {
    environment,
    result:
      action === 'sync' ? 'configured but unverified' : 'read-only inventory',
    alertRouting:
      'Existing monitor routing is preserved; new monitors use the account default notification list.',
    monitors: statuses,
  };
}
