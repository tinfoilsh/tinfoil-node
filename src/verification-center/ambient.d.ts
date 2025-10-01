// Minimal ambient module declarations to allow building the optional UI
// while keeping third-party UI peer deps optional.

declare module '@xyflow/react' {
  export const ReactFlowProvider: any
  export interface ReactFlowProps {
    nodes?: any[]
    edges?: any[]
    onNodesChange?: (changes: any) => void
    onEdgesChange?: (changes: any) => void
    nodeTypes?: any
    edgeTypes?: any
    defaultEdgeOptions?: any
    fitView?: boolean
    onInit?: (instance: any) => void
    nodesDraggable?: boolean
    nodesConnectable?: boolean
    elementsSelectable?: boolean
    zoomOnScroll?: boolean
    zoomOnPinch?: boolean
    panOnDrag?: boolean
    preventScrolling?: boolean
    proOptions?: any
    children?: any
  }
  export function ReactFlow(props: ReactFlowProps): any
  export const Background: any
  export enum BackgroundVariant { Dots }
  export function useEdgesState<T = any>(initial?: T[]): [
    T[],
    (updater: T[] | ((eds: T[]) => T[])) => void,
    (changes: any) => void,
  ]
  export function useNodesState<T = any>(initial?: T[]): [
    T[],
    (updater: T[] | ((nds: T[]) => T[])) => void,
    (changes: any) => void,
  ]
  export function useReactFlow(): any
  export const Handle: any
  export const Position: any
  export function getBezierPath(...args: any[]): any
  export type Edge = any
  export type EdgeProps<T = any> = any
  export type Node<T = any> = any
  export type NodeProps<T = any> = any
}

declare module '@heroicons/react/24/outline' {
  export const ChevronDownIcon: any
  export const ShieldCheckIcon: any
  export const ExclamationTriangleIcon: any
  export const CheckIcon: any
  export const XMarkIcon: any
}

declare module 'react-icons/ai' { export const AiOutlineLoading3Quarters: any }
declare module 'react-icons/fa' { export const FaGithub: any; export const FaUser: any }
declare module 'react-icons/lu' { export const LuExternalLink: any; export const LuRefreshCcwDot: any; export const LuBrain: any; export const LuCpu: any }
declare module 'react-icons/io5' { export const IoCodeSlashOutline: any }
declare module 'react-icons/bs' { export const BsDiagram3: any }
declare module 'react-icons/fi' { export const FiGithub: any; export const FiKey: any; export const FiShield: any }

declare module 'framer-motion' {
  export const motion: any
  export const AnimatePresence: any
}

declare module '*.css'
