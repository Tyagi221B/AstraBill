/**
 * Redis client — Upstash REST.
 *
 * Why Upstash REST: Vercel serverless / edge functions can't hold a persistent
 * TCP connection, and a fresh ioredis socket on every cold start is slow.
 * Upstash's REST protocol cleanly fits the request/response shape.
 *
 * The BullMQ WhatsApp send queue (DO worker, persistent connection) uses
 * ioredis against the same Upstash instance over its TCP endpoint. Same DB,
 * two protocols matched to two runtimes.
 *
 * Lazy singleton so an unrelated route that doesn't touch Redis won't crash on
 * import in a dev env without UPSTASH_* set.
 */
import "server-only";
import { Redis } from "@upstash/redis";

let instance: Redis | undefined;

function getInstance(): Redis {
  if (instance) return instance;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and " +
        "UPSTASH_REDIS_REST_TOKEN in .env.local (see .env.example).",
    );
  }
  instance = new Redis({ url, token });
  return instance;
}

// Proxy keeps the ergonomic `redis.get(...)` call shape while deferring
// instantiation until the first command. The cleverness is contained to
// this file.
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const i = getInstance();
    const value = Reflect.get(i, prop, i);
    return typeof value === "function" ? value.bind(i) : value;
  },
});
