import { ensureCliError } from './errors.js';

export interface IncludesObject {
  users?: any[];
  media?: any[];
  tweets?: any[];
  polls?: any[];
  places?: any[];
}

export type OutputFormat = 'toon' | 'json';

let currentOutputFormat: OutputFormat = 'toon';

export function setOutputFormat(format: OutputFormat): void {
  currentOutputFormat = format;
}

export function getOutputFormat(): OutputFormat {
  return currentOutputFormat;
}

export function mergeIncludes(target: IncludesObject, source: IncludesObject): IncludesObject {
  const result = { ...target };
  for (const key of ['users', 'media', 'tweets', 'polls', 'places'] as const) {
    if (source[key]) {
      const existing = result[key] ?? [];
      const existingIds = new Set(existing.map((item: any) => item.id ?? item.media_key));
      const newItems = source[key]!.filter((item: any) => !existingIds.has(item.id ?? item.media_key));
      result[key] = [...existing, ...newItems];
    }
  }
  return result;
}

export function printData(data: unknown): void {
  printStructured(data);
}

export function printError(error: unknown): void {
  const cliError = ensureCliError(error);
  if (cliError.diagnostic) {
    console.error(cliError.diagnostic);
  }

  const payload: Record<string, unknown> = {
    error: cliError.message,
    ...(cliError.code ? { code: cliError.code } : {}),
    ...cliError.details,
    ...(cliError.help.length > 0 ? { help: cliError.help } : {}),
  };

  printStructured(payload);
}

export function runCommand<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown> | unknown,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs): Promise<void> => {
    try {
      const result = await action(...args);
      if (result !== undefined) {
        printData(result);
      }
    } catch (error) {
      const cliError = ensureCliError(error);
      printError(cliError);
      process.exitCode = cliError.exitCode;
    }
  };
}

function printStructured(data: unknown): void {
  if (currentOutputFormat === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(toToon(data));
}

export function toToon(value: unknown): string {
  if (!isPlainObject(value)) {
    return formatValue(value);
  }

  return renderObject(value, '');
}

function renderObject(obj: Record<string, unknown>, indent: string): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    lines.push(...renderEntry(key, value, indent));
  }

  return lines.join('\n');
}

function renderEntry(key: string, value: unknown, indent: string): string[] {
  if (isScalar(value)) {
    return [`${indent}${key}: ${formatValue(value)}`];
  }

  if (Array.isArray(value)) {
    return renderArray(key, value, indent);
  }

  if (isPlainObject(value)) {
    const nested = renderObject(value, `${indent}  `);
    return nested.length > 0 ? [`${indent}${key}:`, nested] : [`${indent}${key}: {}`];
  }

  return [`${indent}${key}: ${formatValue(value)}`];
}

function renderArray(key: string, value: unknown[], indent: string): string[] {
  if (value.length === 0) {
    return [`${indent}${key}[0]:`];
  }

  if (value.every(isScalar)) {
    return [
      `${indent}${key}[${value.length}]:`,
      ...value.map((item) => `${indent}  ${formatValue(item)}`),
    ];
  }

  const sharedFields = getSharedScalarFields(value);
  if (sharedFields.length > 0) {
    return [
      `${indent}${key}[${value.length}]{${sharedFields.join(',')}}:`,
      ...value.map((item) => `${indent}  ${sharedFields.map((field) => formatRowValue((item as Record<string, unknown>)[field])).join(',')}`),
    ];
  }

  const lines: string[] = [`${indent}${key}[${value.length}]:`];
  value.forEach((item, index) => {
    if (isPlainObject(item)) {
      lines.push(`${indent}  item${index + 1}:`);
      lines.push(renderObject(item, `${indent}    `));
      return;
    }
    if (Array.isArray(item)) {
      lines.push(`${indent}  item${index + 1}[${item.length}]:`);
      lines.push(...item.map((entry) => `${indent}    ${formatValue(entry)}`));
      return;
    }
    lines.push(`${indent}  ${formatValue(item)}`);
  });

  return lines;
}

function getSharedScalarFields(items: unknown[]): string[] {
  if (items.length === 0 || !items.every(isPlainObject)) {
    return [];
  }

  const records = items as Array<Record<string, unknown>>;
  const firstKeys = Object.keys(records[0]);
  if (firstKeys.length === 0) {
    return [];
  }

  const sharedKeys = firstKeys.filter((key) =>
    records.every((item) => Object.prototype.hasOwnProperty.call(item, key) && isScalar(item[key])),
  );

  return sharedKeys;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatRowValue(value: unknown): string {
  return formatValue(value);
}
