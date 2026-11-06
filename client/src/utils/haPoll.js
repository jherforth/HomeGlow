// Reading Home Assistant through the server, every few seconds, the same way
// for display modes and takeovers (hooks/useDisplayModes.js) and Stacks
// (hooks/useStackStates.js):
// - one read at a time: a slow answer is never overtaken by the next;
// - a failed read waits longer before the next (to maxBackoffMs);
// - a short blip changes nothing: what was last read stays until reads have
//   failed for graceMs. Then onDown, once. Takeovers don't flicker and chime
//   again, and modes don't drop back to the schedule, over one missed read.

export const HA_GRACE_MS = 60 * 1000;
export const HA_BACKOFF_MAX_MS = 30 * 1000;

/** The server answered, and so did Home Assistant (or it isn't set up). */
export const haAnswered = (data) => Boolean(data) && !(data.connected && data.reachable === false);

/**
 * - fetch(): resolves to the server's answer
 * - ok(answer): whether it counts as answered (haAnswered)
 * - onAnswer(answer): each good answer
 * - onDown(answer or null): once, when reads have failed for graceMs (at once
 *   when nothing was ever read)
 * - holding: something read before this poll started is still shown (a
 *   restart after a settings change), so a first failure is a blip too
 * Returns stop().
 */
export function startHaPoll({
  fetch,
  ok = haAnswered,
  onAnswer,
  onDown,
  intervalMs,
  graceMs = HA_GRACE_MS,
  maxBackoffMs = HA_BACKOFF_MAX_MS,
  now = Date.now,
  holding = false,
}) {
  let stopped = false;
  let busy = false;
  let failures = 0;
  let nextAt = 0;
  let failingSince = null;
  let hadAnswer = holding;
  let downSent = false;

  const tick = async () => {
    if (stopped || busy || now() < nextAt) return;
    busy = true;
    let answer = null;
    let good = false;
    try {
      answer = await fetch();
      good = ok(answer);
    } catch {
      good = false;
    }
    busy = false;
    if (stopped) return;
    if (good) {
      failures = 0;
      nextAt = 0;
      failingSince = null;
      hadAnswer = true;
      downSent = false;
      onAnswer(answer);
      return;
    }
    failures += 1;
    nextAt = now() + Math.min(maxBackoffMs, intervalMs * 2 ** (failures - 1));
    if (failingSince == null) failingSince = now();
    if (!downSent && (!hadAnswer || now() - failingSince >= graceMs)) {
      downSent = true;
      onDown(answer);
    }
  };

  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
