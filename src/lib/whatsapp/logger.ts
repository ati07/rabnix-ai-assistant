import type { ILogger } from "baileys/lib/Utils/logger.js";

/**
 * A no-op logger for Baileys.
 *
 * Baileys expects a pino-like logger. Its internal chatter is extremely noisy
 * and unrelated to our app, so we silence it and rely on our own `console`
 * logging in the channel/worker instead. Bump this to a real pino logger if you
 * ever need to debug the socket protocol.
 */
export const silentLogger: ILogger = {
  level: "silent",
  child: () => silentLogger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
