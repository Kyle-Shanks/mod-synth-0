import type { StateCreator } from 'zustand'
import type { StoreState } from './index'
import type { TutorialCompletionMap, TutorialMode } from '../tutorials/model'
import { getTutorialLesson } from '../tutorials/lessons'
import {
  loadTutorialCompletion,
  saveTutorialCompletion,
} from '../tutorials/storage'

export interface TutorialSlice {
  tutorialPanelOpen: boolean
  tutorialMode: TutorialMode
  activeTutorialId: string | null
  tutorialStepIndex: number
  tutorialHint: string | null
  tutorialShowDemo: boolean
  tutorialCompletion: TutorialCompletionMap

  setTutorialPanelOpen: (open: boolean) => void
  setTutorialMode: (mode: TutorialMode) => void
  startTutorial: (tutorialId: string) => void
  stopTutorial: () => void
  setTutorialShowDemo: (show: boolean) => void
  tryCurrentTutorialStep: () => void
  syncTutorialProgress: () => void
}

export const createTutorialSlice: StateCreator<
  StoreState,
  [],
  [],
  TutorialSlice
> = (set, get) => ({
  tutorialPanelOpen: false,
  tutorialMode: 'beginner',
  activeTutorialId: null,
  tutorialStepIndex: 0,
  tutorialHint: null,
  tutorialShowDemo: false,
  tutorialCompletion: loadTutorialCompletion(),

  setTutorialPanelOpen(open) {
    set({ tutorialPanelOpen: open })
  },

  setTutorialMode(mode) {
    set({ tutorialMode: mode })
  },

  startTutorial(tutorialId) {
    const lesson = getTutorialLesson(tutorialId)
    if (!lesson) return
    set({
      activeTutorialId: tutorialId,
      tutorialMode: lesson.mode,
      tutorialStepIndex: 0,
      tutorialHint: null,
      tutorialShowDemo: false,
      tutorialPanelOpen: true,
    })
    get().syncTutorialProgress()
  },

  stopTutorial() {
    set({
      activeTutorialId: null,
      tutorialStepIndex: 0,
      tutorialHint: null,
      tutorialShowDemo: false,
    })
  },

  setTutorialShowDemo(show) {
    set({ tutorialShowDemo: show })
  },

  tryCurrentTutorialStep() {
    const tutorialId = get().activeTutorialId
    if (!tutorialId) return
    const lesson = getTutorialLesson(tutorialId)
    if (!lesson) return
    const step = lesson.steps[get().tutorialStepIndex]
    if (!step?.autoPerform) return
    step.autoPerform(get())
    get().syncTutorialProgress()
  },

  syncTutorialProgress() {
    const state = get()
    const tutorialId = state.activeTutorialId
    if (!tutorialId) return
    const lesson = getTutorialLesson(tutorialId)
    if (!lesson) {
      set({
        activeTutorialId: null,
        tutorialStepIndex: 0,
        tutorialHint: null,
        tutorialShowDemo: false,
      })
      return
    }

    let nextIndex = state.tutorialStepIndex
    let nextHint: string | null = null

    while (nextIndex < lesson.steps.length) {
      const step = lesson.steps[nextIndex]
      if (!step) break
      const result = step.validate(get())
      if (!result.ok) {
        nextHint = result.hint ?? null
        break
      }
      nextIndex += 1
    }

    const updates: Partial<TutorialSlice> = {}
    if (nextIndex !== state.tutorialStepIndex) {
      updates.tutorialStepIndex = nextIndex
      updates.tutorialShowDemo = false
    }
    if (nextHint !== state.tutorialHint) {
      updates.tutorialHint = nextHint
    }

    const justCompleted =
      state.tutorialStepIndex < lesson.steps.length &&
      nextIndex >= lesson.steps.length

    if (justCompleted) {
      const completedAt = new Date().toISOString()
      const nextCompletion = {
        ...get().tutorialCompletion,
        [tutorialId]: completedAt,
      }
      updates.tutorialCompletion = nextCompletion
      updates.tutorialHint = 'lesson complete.'
      saveTutorialCompletion(nextCompletion)
    }

    if (Object.keys(updates).length > 0) {
      set(updates)
    }
  },
})
