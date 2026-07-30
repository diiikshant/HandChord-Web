export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function mapAxis(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || maximum <= minimum) {
    return null
  }
  return clamp((value - minimum) / (maximum - minimum))
}

export function applyDeadZone(next: number, previous: number | null, deadZone = 0.05) {
  return previous !== null && Math.abs(next - previous) < deadZone ? previous : next
}

export function smoothValue(previous: number | null, next: number, amount = 0.22) {
  return previous === null ? next : previous + (next - previous) * amount
}

export function median(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}
