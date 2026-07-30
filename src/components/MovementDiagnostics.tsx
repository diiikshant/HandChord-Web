import type { MovementState } from '../hooks/useMovementTracking.ts'

function value(value: number | null) { return value === null ? '—' : value.toFixed(2) }
export function MovementDiagnostics({ movement }: { movement: MovementState }) {
  const rows = [['Left hand', movement.left, 'Reverb', 'Distortion'], ['Right hand', movement.right, 'Volume', 'Chorus']] as const
  return <section className="movement-panel" aria-labelledby="movement-title">
    <h2 id="movement-title">Four-axis movement diagnostics</h2>
    <p>Values are calculated only. They do not control audio effects yet.</p>
    <div className="movement-grid">{rows.map(([name, hand, verticalName, horizontalName]) => <article key={name} className="movement-card">
      <h3>{name}</h3><p>{hand.reason ?? 'tracking'}</p>
      <dl><div><dt>Raw X / Y</dt><dd>{value(hand.rawX)} / {value(hand.rawY)}</dd></div><div><dt>Smoothed X / Y</dt><dd>{value(hand.smoothedX)} / {value(hand.smoothedY)}</dd></div><div><dt>{verticalName} vertical</dt><dd>{value(hand.vertical)}</dd></div><div><dt>{horizontalName} horizontal</dt><dd>{value(hand.horizontal)}</dd></div><div><dt>Hand confidence</dt><dd>{hand.confidence === null ? '—' : `${(hand.confidence * 100).toFixed(1)}%`}</dd></div></dl>
    </article>)}</div>
  </section>
}
