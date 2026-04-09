export type CliExitCode = 1 | 2;

interface CliErrorOptions {
  code?: string;
  exitCode?: CliExitCode;
  help?: string[];
  details?: Record<string, unknown>;
  diagnostic?: string;
  cause?: unknown;
}

export class CliError extends Error {
  readonly code?: string;
  readonly exitCode: CliExitCode;
  readonly help: string[];
  readonly details: Record<string, unknown>;
  readonly diagnostic?: string;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'CliError';
    this.code = options.code;
    this.exitCode = options.exitCode ?? 1;
    this.help = options.help ?? [];
    this.details = options.details ?? {};
    this.diagnostic = options.diagnostic;
  }
}

export function usageError(
  message: string,
  options: Omit<CliErrorOptions, 'exitCode'> = {},
): CliError {
  return new CliError(message, { ...options, exitCode: 2 });
}

export function runtimeError(
  message: string,
  options: Omit<CliErrorOptions, 'exitCode'> = {},
): CliError {
  return new CliError(message, { ...options, exitCode: 1 });
}

export function ensureCliError(error: unknown): CliError {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof Error) {
    return runtimeError(error.message, { cause: error });
  }
  return runtimeError(String(error));
}
