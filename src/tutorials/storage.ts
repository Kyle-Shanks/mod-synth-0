import type { TutorialCompletionMap } from './model'

const TUTORIAL_COMPLETION_KEY = 'modsynth0:tutorial-completion'

export function loadTutorialCompletion(): TutorialCompletionMap {
  try {
    const raw = localStorage.getItem(TUTORIAL_COMPLETION_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const next: TutorialCompletionMap = {}
    for (const [lessonId, completedAt] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof completedAt !== 'string') continue
      next[lessonId] = completedAt
    }
    return next
  } catch {
    return {}
  }
}

export function saveTutorialCompletion(completed: TutorialCompletionMap): void {
  try {
    localStorage.setItem(TUTORIAL_COMPLETION_KEY, JSON.stringify(completed))
  } catch {
    console.warn('failed to save tutorial completion state')
  }
}
