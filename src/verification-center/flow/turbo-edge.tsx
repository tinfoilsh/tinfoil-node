'use client'

import { getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'

type CustomEdge = Edge

function TurboEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  sourceHandleId,
  targetHandleId,
}: EdgeProps<CustomEdge>) {
  const xEqual = sourceX === targetX
  const yEqual = sourceY === targetY

  let adjustedSourceX = sourceX
  let adjustedSourceY = sourceY
  let adjustedTargetX = targetX
  let adjustedTargetY = targetY

  if (id === 'e-enclave-attestation') {
    adjustedSourceX = sourceX + 100
  }

  if (id === 'e-client-github') {
    adjustedSourceX = sourceX
  }

  if (id === 'e-client-sigstore') {
    adjustedSourceX = sourceX
  }

  const pathParams = {
    sourceX: xEqual ? adjustedSourceX + 0.0001 : adjustedSourceX,
    sourceY: yEqual ? adjustedSourceY + 0.0001 : adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
    curvature: 0.3,
  }

  if (sourceHandleId === 'source-left') {
    pathParams.sourceX -= 5
  } else if (sourceHandleId === 'source-right') {
    pathParams.sourceX += 5
  } else if (sourceHandleId === 'source-top') {
    pathParams.sourceY -= 5
  } else if (sourceHandleId === 'source-bottom') {
    pathParams.sourceY += 5
  }

  if (targetHandleId === 'target-left') {
    pathParams.targetX -= 5
  } else if (targetHandleId === 'target-right') {
    pathParams.targetX += 5
  } else if (targetHandleId === 'target-top') {
    pathParams.targetY -= 5
  } else if (targetHandleId === 'target-bottom') {
    pathParams.targetY += 5
  }

  const [edgePath] = getBezierPath(pathParams)

  return (
    <path
      id={id}
      style={{ stroke: 'rgba(0, 0, 0, 0.6)', ...style }}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
    />
  )
}

TurboEdge.displayName = 'TurboEdge'

export default memo(TurboEdge)

