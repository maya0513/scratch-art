export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Surface {
  readonly width: number;
  readonly height: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export const MAX_PIXELS = 6_000_000;

export function surfaceSize(width: number, height: number, dpr: number): Surface {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(Math.max(1, dpr), 2, Math.sqrt(MAX_PIXELS / (w * h)));
  return {
    width: w,
    height: h,
    pixelWidth: Math.max(1, Math.floor(w * scale)),
    pixelHeight: Math.max(1, Math.floor(h * scale)),
  };
}

/** Paper coordinates are CSS pixels, with a fixed origin at the sheet's center. */
export function paperPoint(
  client: Point,
  rect: Readonly<Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>>,
  surface: Surface,
): Point {
  return {
    x: ((client.x - rect.left) / rect.width) * surface.width - surface.width / 2,
    y: ((client.y - rect.top) / rect.height) * surface.height - surface.height / 2,
  };
}

/** Carry the unused distance forward so event frequency cannot leave gaps. */
export function resampleSegment(
  from: Point,
  to: Point,
  spacing: number,
  carried: number,
): { points: Point[]; carried: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const points: Point[] = [];
  if (length === 0) return { points, carried };
  for (let distance = spacing - carried; distance <= length + 1e-8; distance += spacing) {
    const fraction = Math.min(distance / length, 1);
    points.push({ x: from.x + dx * fraction, y: from.y + dy * fraction });
  }
  const remainder = carried + length - points.length * spacing;
  return { points, carried: Math.max(0, Math.min(remainder, spacing - 1e-8)) };
}

export function paperTransform(ctx: CanvasRenderingContext2D, surface: Surface): void {
  ctx.setTransform(
    surface.pixelWidth / surface.width,
    0,
    0,
    surface.pixelHeight / surface.height,
    surface.pixelWidth / 2,
    surface.pixelHeight / 2,
  );
}
