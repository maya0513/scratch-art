export function context2D(
  canvas: HTMLCanvasElement,
  options: Readonly<CanvasRenderingContext2DSettings> = {},
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (context === null) throw new Error('Canvas 2D is not available.');
  return context;
}
