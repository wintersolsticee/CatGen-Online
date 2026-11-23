import { CLANS, TERRAIN, getClan, type WorldMap } from "@catgen/shared";
import { makeCanvas } from "../../render/color.ts";

/** Pre-rendered map image (1 pixel per tile, with territory tint). */
export function renderMapImage(map: WorldMap, scale = 2): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(map.width * scale, map.height * scale);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = map.terrainAtTile(x, y);
    ctx.fillStyle = t.palette[0];
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  // Territory tint.
  for (const terr of map.territories) {
    const c = getClan(terr.clan)!.color;
    ctx.fillStyle = c + "33";
    ctx.beginPath();
    terr.polygon.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (p.x / map.tileSize) * scale, (p.y / map.tileSize) * scale));
    ctx.closePath();
    ctx.fill();
  }
  // Trees as dark dots for texture.
  ctx.fillStyle = "rgba(20,40,15,0.35)";
  for (const o of map.objects) if (o.kind.startsWith("tree")) ctx.fillRect((o.x / map.tileSize) * scale, (o.y / map.tileSize) * scale, scale * 0.8, scale * 0.8);
  void TERRAIN;
  void CLANS;
  return canvas;
}

export interface MapMarker { x: number; y: number; color: string; r: number; label?: string }

/** Draw a view of the map centred on (cx,cy) world px, `span` world px wide, into canvas. */
export function drawMinimap(canvas: HTMLCanvasElement, base: HTMLCanvasElement, map: WorldMap, cx: number, cy: number, span: number, markers: MapMarker[], labels: { x: number; y: number; text: string }[] = []) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth * dpr, H = canvas.clientHeight * dpr;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext("2d")!;
  const scale = base.width / map.pixelWidth;
  const spanY = span * (H / W);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#101810";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(base, (cx - span / 2) * scale, (cy - spanY / 2) * scale, span * scale, spanY * scale, 0, 0, W, H);
  const toScreen = (x: number, y: number) => [((x - (cx - span / 2)) / span) * W, ((y - (cy - spanY / 2)) / spanY) * H];
  ctx.font = `${11 * dpr}px Nunito, system-ui`;
  ctx.textAlign = "center";
  for (const l of labels) {
    const [sx, sy] = toScreen(l.x, l.y);
    if (sx < -50 || sy < -20 || sx > W + 50 || sy > H + 20) continue;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(l.text, sx + 1, sy + 1);
    ctx.fillStyle = "#f3ead6";
    ctx.fillText(l.text, sx, sy);
  }
  for (const m of markers) {
    const [sx, sy] = toScreen(m.x, m.y);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(sx, sy, m.r * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
