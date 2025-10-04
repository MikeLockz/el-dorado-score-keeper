const KEY_DENYLIST = new Set([
  'name',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'message',
  'raw_input',
  'notes',
  'address',
  'phone',
]);

const EVENT_ALLOWLIST = new Map<string, Set<string>>([
  ['browser.exception', new Set(['name', 'message', 'stack'])],
  ['browser.message', new Set(['message'])],
]);

const LONG_VALUE_ALLOWLIST = new Set([
  'stack',
  'sessionUrl',
  'path',
  'pathname',
  'search',
  'referrer',
  'title',
  'message',
]);

const MAX_STRING_LENGTH = 512;

const isStringTooLong = (key: string, value: string) =>
  !LONG_VALUE_ALLOWLIST.has(key) && value.trim().length > MAX_STRING_LENGTH;

const isDisallowedKey = (event: string, key: string) => {
  if (!KEY_DENYLIST.has(key)) return false;
  const allowlist = EVENT_ALLOWLIST.get(event);
  return !(allowlist && allowlist.has(key));
};

export const assertTelemetryPropertiesSafe = (event: string, props?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (!props) return;

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    if (isDisallowedKey(event, key)) {
      throw new Error(
        `[analytics] Disallowed telemetry attribute "${key}" detected on event "${event}".`,
      );
    }

    if (typeof value === 'string') {
      if (isStringTooLong(key, value)) {
        throw new Error(
          `[analytics] Telemetry attribute "${key}" on event "${event}" exceeds safe length (${MAX_STRING_LENGTH}).`,
        );
      }
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && isStringTooLong(key, entry)) {
          throw new Error(
            `[analytics] Telemetry attribute "${key}" on event "${event}" includes a string that exceeds safe length (${MAX_STRING_LENGTH}).`,
          );
        }
      }
    }
  }
};
