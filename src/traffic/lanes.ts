import type { WorldPoint } from '../city/types'
import { BLOCK_SIZE } from '../config'
import type { Lane } from './types'

const CROSSING_CENTER_OFFSET = -20
const FORWARD_LANE_OFFSET = -16
const OPPOSING_LANE_OFFSET = -23

interface LaneIntersection {
  readonly key: string
  readonly point: WorldPoint
  readonly progress: number
}

export const laneKey = ({ direction, line }: Lane): string => `${direction}:${line}`

export const intersectionKey = (xIndex: number, zIndex: number): string =>
  `${xIndex}:${zIndex}`

export const positionOnLane = (lane: Lane, progress: number): WorldPoint => {
  const lineOrigin = lane.line * BLOCK_SIZE

  switch (lane.direction) {
    case 'east':
      return { x: progress, z: lineOrigin + FORWARD_LANE_OFFSET }
    case 'west':
      return { x: -progress, z: lineOrigin + OPPOSING_LANE_OFFSET }
    case 'north':
      return { x: lineOrigin + OPPOSING_LANE_OFFSET, z: progress }
    case 'south':
      return { x: lineOrigin + FORWARD_LANE_OFFSET, z: -progress }
  }
}

export const nextIntersection = (lane: Lane, progress: number): LaneIntersection => {
  const travelsPositiveAxis = lane.direction === 'east' || lane.direction === 'north'
  const crossingIndex = travelsPositiveAxis
    ? Math.ceil((progress - CROSSING_CENTER_OFFSET) / BLOCK_SIZE)
    : Math.floor((-CROSSING_CENTER_OFFSET - progress) / BLOCK_SIZE)
  const crossingProgress = travelsPositiveAxis
    ? crossingIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET
    : -(crossingIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET)
  const xIndex = lane.direction === 'east' || lane.direction === 'west'
    ? crossingIndex
    : lane.line
  const zIndex = lane.direction === 'north' || lane.direction === 'south'
    ? crossingIndex
    : lane.line

  return {
    key: intersectionKey(xIndex, zIndex),
    point: {
      x: xIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET,
      z: zIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET,
    },
    progress: crossingProgress,
  }
}
