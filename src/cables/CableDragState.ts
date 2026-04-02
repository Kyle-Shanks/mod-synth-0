import type { PortType } from '../engine/types'

export interface CableDragState {
  fromModuleId: string
  fromPortId: string
  fromDirection: 'input' | 'output'
  portType: PortType
  cursorX: number
  cursorY: number
}
