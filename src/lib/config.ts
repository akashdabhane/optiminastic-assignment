export const config = {
  rateLimit: {
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
    windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
    get windowMs() {
      return this.windowSeconds * 1000;
    },
  },
};
