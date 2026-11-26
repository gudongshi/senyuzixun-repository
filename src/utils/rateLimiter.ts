/**
 * v16.4: 简易请求限流器 — 避免并发 AI 调用触发阿里云 429 限流
 *
 * 用法：
 *   const result = await rateLimitedAI(() => fetch('/api/...'));
 *
 * 所有通过此包装的调用会按顺序排队，间隔 ≥ 2 秒
 */

type AsyncFn<T> = () => Promise<T>;

let lastCallTime = 0;
const MIN_GAP_MS = 2000; // 两次 AI 调用至少间隔 2 秒

export async function rateLimitedAI<T>(fn: AsyncFn<T>): Promise<T> {
  const now = Date.now();
  const waitMs = Math.max(0, MIN_GAP_MS - (now - lastCallTime));
  if (waitMs > 0) {
    console.log(`⏳ [限流器] 等待 ${waitMs}ms 后发起 AI 请求...`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastCallTime = Date.now();
  console.log(`🚀 [限流器] 发起 AI 请求, timestamp: ${new Date(lastCallTime).toISOString()}`);
  return fn();
}