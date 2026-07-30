export type Size = {
  width: number
  height: number
}

export type ContainRect = Size & {
  x: number
  y: number
}

export type NormalizedPoint = {
  x: number
  y: number
}

export function getContainRect(container: Size, source: Size): ContainRect {
  if (container.width <= 0 || container.height <= 0 || source.width <= 0 || source.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const scale = Math.min(container.width / source.width, container.height / source.height)
  const width = source.width * scale
  const height = source.height * scale

  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  }
}

export function normalizedPointToCanvas(
  point: NormalizedPoint,
  videoRect: ContainRect,
  mirrorHorizontally = true,
): NormalizedPoint {
  const x = mirrorHorizontally ? 1 - point.x : point.x

  return {
    x: videoRect.x + x * videoRect.width,
    y: videoRect.y + point.y * videoRect.height,
  }
}
