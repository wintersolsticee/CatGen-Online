import { stepMovement, type InputMsg } from "@catgen/shared";
import type { GameContext, PlayerRuntime } from "./context.ts";

const MAX_BUDGET_MS = 300;

/**
 * Apply one client input authoritatively. The client predicts with the same
 * shared stepMovement() and reconciles using state.lastSeq.
 * A time budget stops clients from moving faster by sending inputs more often.
 */
export function handleInput(ctx: GameContext, p: PlayerRuntime, msg: InputMsg) {
  const now = ctx.now();
  p.moveBudgetMs = Math.min(MAX_BUDGET_MS, p.moveBudgetMs + (now - p.lastInputAt));
  p.lastInputAt = now;
  const dtMs = Math.min(msg.dt, p.moveBudgetMs);
  p.moveBudgetMs -= dtMs;
  const s = p.state;
  s.lastSeq = msg.seq;

  const moving = Math.hypot(msg.dx, msg.dy) > 0.01;
  if (moving && s.pose) s.pose = "";
  const res = stepMovement(ctx.map, { x: s.x, y: s.y, stamina: s.stamina }, { dx: msg.dx, dy: msg.dy, run: msg.run, stalk: msg.stalk, dt: dtMs / 1000 }, { rank: p.char.rank, conditions: p.char.conditions });
  s.x = res.x;
  s.y = res.y;
  s.stamina = res.stamina;
  s.moving = res.moving;
  s.running = res.running;
  s.stalking = msg.stalk && res.moving;
  if (res.running) p.lastRanAt = now;
  if (moving) s.facing = Math.atan2(msg.dy, msg.dx);
}
