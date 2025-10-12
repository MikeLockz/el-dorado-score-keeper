type PerformanceMarkers = Readonly<{
  start: string;
  end: string;
  measure: string;
}>;

const performanceTelemetryEnabled =
  typeof performance !== 'undefined' &&
  typeof performance.mark === 'function' &&
  typeof performance.measure === 'function';

const createMarkerId = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

export const createPerformanceMarkers = (label: string): PerformanceMarkers | null => {
  if (!performanceTelemetryEnabled) return null;
  const id = createMarkerId(label);
  return {
    start: `${label}.start.${id}`,
    end: `${label}.end.${id}`,
    measure: `${label}.duration.${id}`,
  };
};

export const markPerformanceStart = (markers: PerformanceMarkers | null): void => {
  if (!markers) return;
  try {
    performance.mark(markers.start);
  } catch {}
};

export const completePerformanceMeasurement = (markers: PerformanceMarkers | null): void => {
  if (!markers) return;
  try {
    performance.mark(markers.end);
    performance.measure(markers.measure, markers.start, markers.end);
  } catch {}
  try {
    performance.clearMarks(markers.start);
    performance.clearMarks(markers.end);
  } catch {}
};

export const measureSync = <T>(label: string, fn: () => T): T => {
  const markers = createPerformanceMarkers(label);
  markPerformanceStart(markers);
  try {
    return fn();
  } finally {
    completePerformanceMeasurement(markers);
  }
};

export const measureAsync = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const markers = createPerformanceMarkers(label);
  markPerformanceStart(markers);
  try {
    return await fn();
  } finally {
    completePerformanceMeasurement(markers);
  }
};
