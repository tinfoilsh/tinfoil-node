'use client'

import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'

type TurboNodeData = {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  isEnclave?: boolean
  isContainer?: boolean
}

type CustomNode = Node<TurboNodeData>

const getNodeStyle = (title: string) => {
  switch (title) {
    case 'Tinfoil Server':
      return {
        backgroundColor: 'rgba(220,220,220,0.2)',
        color: 'var(--text-color)',
        borderRadius: '24px',
      }
    case 'Client':
    case 'Secure Hardware Enclave':
      return {
        backgroundColor: 'rgba(193, 225, 255, 0.2)',
        color: 'var(--text-color)',
        borderRadius: '24px',
      }
    case 'Verification Engine':
      return {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        color: 'var(--text-color)',
        borderRadius: '24px',
      }
    case 'You':
      return {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        color: 'var(--text-color)',
        borderRadius: '24px',
      }
    default:
      return {}
  }
}

function TurboNode(props: NodeProps<CustomNode>) {
  const { data, ...rest } = props
  const style = (rest as any).style || {}
  const nodeStyle = getNodeStyle(data.title)
  const iconColor = nodeStyle.color || 'currentColor'

  if (data.isContainer) {
    return (
      <div
        className="container-node"
        style={{
          ...style,
          ...nodeStyle,
          color: 'var(--text-color)',
        }}
      >
        <div className="container-header">
          <div className="icon" style={{ color: iconColor }}>
            {data.icon}
          </div>
          <div className="title">{data.title}</div>
        </div>
        <Handle type="target" position={Position.Top} id="target-top" className="connection-handle" style={{ left: '50%' }} />
        <Handle type="source" position={Position.Top} id="source-top" className="connection-handle" style={{ left: '50%' }} />
        <Handle type="target" position={Position.Left} id="target-left" className="connection-handle" style={{ top: '50%' }} />
        <Handle type="source" position={Position.Left} id="source-left" className="connection-handle" style={{ top: '50%' }} />
        <Handle type="target" position={Position.Right} id="target-right" className="connection-handle" style={{ top: '50%' }} />
        <Handle type="source" position={Position.Right} id="source-right" className="connection-handle" style={{ top: '50%' }} />
        <Handle type="target" position={Position.Bottom} id="target-bottom" className="connection-handle" style={{ left: '50%' }} />
        <Handle type="source" position={Position.Bottom} id="source-bottom" className="connection-handle" style={{ left: '50%' }} />
      </div>
    )
  }

  const isColoredNode = !!nodeStyle.backgroundColor

  return isColoredNode ? (
    <div
      style={{
        backgroundColor: nodeStyle.backgroundColor,
        color: nodeStyle.color || 'var(--text-color)',
        borderRadius: '24px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        width: 'auto',
        minWidth: '150px',
        height: '70px',
        fontWeight: 500,
        letterSpacing: '-0.2px',
        boxSizing: 'border-box',
        position: 'relative',
        border: 'none',
        boxShadow: 'none',
      }}
      className={`colored-node ${data.isEnclave ? 'enclave-node' : ''}`}
    >
      <div
        style={{
          color: 'currentColor',
          marginRight: '8px',
          display: 'flex',
          opacity: 0.8,
        }}
      >
        {data.icon}
      </div>
      <div>
        <div style={{ fontSize: '16px', marginBottom: '2px' }}>{data.title}</div>
        {data.subtitle && <div style={{ fontSize: '12px', opacity: 0.7 }}>{data.subtitle}</div>}
      </div>

      <Handle type="target" position={Position.Left} id="target-left" className="connection-handle" />
      <Handle type="source" position={Position.Left} id="source-left" className="connection-handle" />
      <Handle type="target" position={Position.Right} id="target-right" className="connection-handle" />
      <Handle type="source" position={Position.Right} id="source-right" className="connection-handle" />
      <Handle type="target" position={Position.Top} id="target-top" className="connection-handle" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Top} id="source-top" className="connection-handle" style={{ left: '50%' }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className="connection-handle" style={{ left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" className="connection-handle" style={{ left: '50%' }} />
    </div>
  ) : (
    <div className={`react-flow__node-turbo ${data.isEnclave ? 'enclave-node' : ''}`}>
      <div className="wrapper gradient">
        <div className="inner">
          <div className="body">
            <div className="icon" style={{ color: iconColor }}>
              {data.icon}
            </div>
            <div>
              <div className="title">{data.title}</div>
              {data.subtitle && <div className="subtitle">{data.subtitle}</div>}
            </div>
          </div>
          <Handle type="target" position={Position.Left} id="target-left" className="connection-handle" />
          <Handle type="source" position={Position.Left} id="source-left" className="connection-handle" />
          <Handle type="target" position={Position.Right} id="target-right" className="connection-handle" />
          <Handle type="source" position={Position.Right} id="source-right" className="connection-handle" />
          <Handle type="target" position={Position.Top} id="target-top" className="connection-handle" style={{ left: '50%' }} />
          <Handle type="source" position={Position.Top} id="source-top" className="connection-handle" style={{ left: '50%' }} />
          <Handle type="target" position={Position.Bottom} id="target-bottom" className="connection-handle" style={{ left: '50%' }} />
          <Handle type="source" position={Position.Bottom} id="source-bottom" className="connection-handle" style={{ left: '50%' }} />
        </div>
      </div>
    </div>
  )
}

TurboNode.displayName = 'TurboNode'

export type { TurboNodeData }
export default memo(TurboNode)

