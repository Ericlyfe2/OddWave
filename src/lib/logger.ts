type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, event: string, data?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, event, ...data };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${level}]`, JSON.stringify(entry));
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => emit('debug', event, data),
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
};
