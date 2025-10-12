const STATIC_EXPORT_FLAG =
  process.env.NEXT_OUTPUT_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';

export const STATIC_EXPORT_PLACEHOLDER = '__static-export__';

export function isStaticExportBuild(): boolean {
  return STATIC_EXPORT_FLAG;
}

export function staticExportParams<T extends string>(paramName: T): Array<Record<T, string>> {
  if (!STATIC_EXPORT_FLAG) {
    return [];
  }
  return [
    {
      [paramName]: STATIC_EXPORT_PLACEHOLDER,
    } as Record<T, string>,
  ];
}

export function scrubDynamicParam(value: string | string[] | undefined): string {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? (value[0] ?? '') : '';
  const trimmed = raw.trim();
  return trimmed === STATIC_EXPORT_PLACEHOLDER ? '' : trimmed;
}
