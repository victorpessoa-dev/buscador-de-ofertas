import "server-only";

export function logAffiliateConversion(level, message, data) {
  if (process.env.NODE_ENV !== "development") return;

  const logFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  logFn(`[Affiliate ${level.toUpperCase()}]`, message, data || "");
}
