/**
 * Diagnostic utilities for debugging global state issues in tests.
 */

export function captureDevelopmentGlobals() {
  return {
    __START_NEW_GAME__: (globalThis as any).__START_NEW_GAME__,
    __clientLogTrack__: (globalThis as any).__clientLogTrack__,
    timestamp: Date.now(),
  };
}

export function logGlobalState(label: string) {
  const globals = captureDevelopmentGlobals();
  console.log(`[${label}] Global state:`, globals);
  return globals;
}

export function compareGlobalStates(before: any, after: any) {
  return {
    __START_NEW_GAME__: before.__START_NEW_GAME__ !== after.__START_NEW_GAME__,
    __clientLogTrack__: before.__clientLogTrack__ !== after.__clientLogTrack__,
  };
}

export function captureAllGlobals() {
  const allGlobals: Record<string, any> = {};
  for (const key in globalThis) {
    if (key.startsWith('__') && key.endsWith('__')) {
      allGlobals[key] = (globalThis as any)[key];
    }
  }
  return allGlobals;
}

export function logAllGlobals(label: string) {
  const allGlobals = captureAllGlobals();
  console.log(`[${label}] All development globals:`, allGlobals);
  return allGlobals;
}
