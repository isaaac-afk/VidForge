interface PlayheadProps {
  /** Position in seconds. */
  time: number;
  zoom: number;
  /** Visible height in pixels — playhead spans tracks below the ruler. */
  height: number;
}

export function Playhead({ time, zoom, height }: PlayheadProps) {
  const x = time * zoom;
  return (
    <div
      className="pointer-events-none absolute top-0 z-30"
      style={{ left: x, height }}
    >
      <div className="h-3 w-3 -translate-x-1/2 bg-[var(--playhead)] [clip-path:polygon(50%_100%,0_0,100%_0)]" />
      <div className="-ml-px h-full w-0.5 bg-[var(--playhead)]" />
    </div>
  );
}
