type LogContext = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    return {
      message:
        typeof record.message === "string"
          ? record.message
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })(),
      code: typeof record.code === "string" ? record.code : undefined,
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
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
