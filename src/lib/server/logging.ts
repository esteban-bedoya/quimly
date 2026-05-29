type LogContext = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export function logServerInfo(event: string, context: LogContext = {}) {
  console.info(JSON.stringify({ level: "info", event, ...context }));
}

export function logServerError(event: string, error: unknown, context: LogContext = {}) {
  console.error(JSON.stringify({ level: "error", event, ...context, error: normalizeError(error) }));
}
