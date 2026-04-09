import type { SerializedCable, SubpatchDefinition } from '../engine/types'

export type TutorialMode = 'beginner' | 'veteran'

export interface TutorialModuleLike {
  definitionId: string
  position: { x: number; y: number }
  params: Record<string, number>
  data?: Record<string, string>
  subpatchDefinitionId?: string
  macroValues?: Record<string, number>
  containerWidth?: number
  containerHeight?: number
}

export interface TutorialSubpatchContextEntry {
  instanceId: string
  definitionId: string
  name: string
}

export interface TutorialRuntime {
  modules: Record<string, TutorialModuleLike>
  cables: Record<string, SerializedCable>
  feedbackCableIds: Set<string>
  definitions: Record<string, SubpatchDefinition>
  subpatchContext: TutorialSubpatchContextEntry[]
  selectedModuleIds: string[]

  addModule: (definitionId: string, position: { x: number; y: number }) => string
  addCable: (cable: SerializedCable) => void
  setParam: (moduleId: string, param: string, value: number) => void
  setSelectedModule: (id: string | null) => void
  createDefinition: (name: string) => string
  addSubpatchContainer: (defId: string, position: { x: number; y: number }) => string
  enterSubpatch: (instanceId: string, definitionId: string, name: string) => void
  exitSubpatch: () => void
  addMacro: (
    defId: string,
    macro: {
      id: string
      label: string
      targetModuleId: string
      targetParamId: string
    },
  ) => void
  setMacroValue: (instanceId: string, macroId: string, value: number) => void
}

export interface TutorialValidationResult {
  ok: boolean
  hint?: string
}

export type TutorialFocusTarget =
  | { kind: 'module'; moduleId: string }
  | { kind: 'port'; moduleId: string; portId: string }
  | { kind: 'param'; moduleId: string; paramId: string }
  | { kind: 'selector'; selector: string }

export interface TutorialStep {
  id: string
  action: string
  why: string
  hints: string[]
  demo: string
  validate: (runtime: TutorialRuntime) => TutorialValidationResult
  autoPerform?: (runtime: TutorialRuntime) => void
  focus?: (runtime: TutorialRuntime) => TutorialFocusTarget[]
}

export interface TutorialLesson {
  id: string
  title: string
  summary: string
  completionMessage: string
  disabled?: boolean
  mode: TutorialMode
  steps: TutorialStep[]
}

export type TutorialCompletionMap = Record<string, string>
