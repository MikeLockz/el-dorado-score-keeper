export function formatDate(
  input: number | Date | undefined | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!input) return 'Unknown date';

  const d = typeof input === 'number' ? new Date(input) : input;
  if (isNaN(d.getTime())) return 'Invalid date';

  const base: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  };
  return d.toLocaleDateString(undefined, { ...base, ...(options || {}) });
}

export function formatDateTime(input: number | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  const base: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  return d.toLocaleString(undefined, { ...base, ...(options || {}) });
}

export function formatTime(input: number | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof input === 'number' ? new Date(input) : input;
  const base: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  return d.toLocaleTimeString(undefined, { ...base, ...(options || {}) });
}
