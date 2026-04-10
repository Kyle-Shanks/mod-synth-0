import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '../store'
import { getLessonsForMode, getTutorialLesson } from '../tutorials/lessons'
import type { TutorialFocusTarget } from '../tutorials/model'
import styles from './TutorialOverlay.module.css'
import controlPrimitiveStyles from '../styles/controlPrimitives.module.css'
import floatingPanelBaseStyles from '../styles/floatingPanelBase.module.css'

interface FocusRect {
  key: string
  left: number
  top: number
  width: number
  height: number
}

function classes(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ')
}

function resolveElements(targets: TutorialFocusTarget[]): HTMLElement[] {
  const elements: HTMLElement[] = []

  for (const target of targets) {
    if (target.kind === 'selector') {
      document.querySelectorAll<HTMLElement>(target.selector).forEach((el) => {
        elements.push(el)
      })
      continue
    }

    if (target.kind === 'module') {
      const el = document.querySelector<HTMLElement>(
        `[data-module-panel-id="${target.moduleId}"]`,
      )
      if (el) elements.push(el)
      continue
    }

    if (target.kind === 'port') {
      const el = document.querySelector<HTMLElement>(
        `[data-module-panel-id="${target.moduleId}"] [data-port-id="${target.portId}"]`,
      )
      if (el) elements.push(el)
      continue
    }

    if (target.kind === 'param') {
      const el = document.querySelector<HTMLElement>(
        `[data-param-control][data-module-id="${target.moduleId}"][data-param-id="${target.paramId}"]`,
      )
      if (el) elements.push(el)
      continue
    }
  }

  return elements
}

function rectsFromTargets(targets: TutorialFocusTarget[]): FocusRect[] {
  const els = resolveElements(targets)
  const next: FocusRect[] = []
  for (const el of els) {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    next.push({
      key: `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    })
  }
  return next
}

export function TutorialOverlay() {
  const tutorialPanelOpen = useStore((s) => s.tutorialPanelOpen)
  const setTutorialPanelOpen = useStore((s) => s.setTutorialPanelOpen)
  const tutorialMode = useStore((s) => s.tutorialMode)
  const setTutorialMode = useStore((s) => s.setTutorialMode)
  const activeTutorialId = useStore((s) => s.activeTutorialId)
  const tutorialStepIndex = useStore((s) => s.tutorialStepIndex)
  const tutorialHint = useStore((s) => s.tutorialHint)
  const tutorialShowDemo = useStore((s) => s.tutorialShowDemo)
  const setTutorialShowDemo = useStore((s) => s.setTutorialShowDemo)
  const startTutorial = useStore((s) => s.startTutorial)
  const stopTutorial = useStore((s) => s.stopTutorial)
  const tryCurrentTutorialStep = useStore((s) => s.tryCurrentTutorialStep)
  const syncTutorialProgress = useStore((s) => s.syncTutorialProgress)
  const tutorialCompletion = useStore((s) => s.tutorialCompletion)

  const modules = useStore((s) => s.modules)
  const cables = useStore((s) => s.cables)
  const definitions = useStore((s) => s.definitions)
  const subpatchContext = useStore((s) => s.subpatchContext)

  const lessons = useMemo(() => getLessonsForMode(tutorialMode), [tutorialMode])
  const activeLesson = useMemo(
    () => (activeTutorialId ? getTutorialLesson(activeTutorialId) : null),
    [activeTutorialId],
  )

  const isCompleted =
    !!activeLesson && tutorialStepIndex >= activeLesson.steps.length
  const currentStep =
    activeLesson && !isCompleted ? activeLesson.steps[tutorialStepIndex] : null

  const [focusRects, setFocusRects] = useState<FocusRect[]>([])

  useEffect(() => {
    if (!activeTutorialId) return
    syncTutorialProgress()
  }, [
    activeTutorialId,
    tutorialStepIndex,
    modules,
    cables,
    definitions,
    subpatchContext,
    syncTutorialProgress,
  ])

  useEffect(() => {
    if (!currentStep?.focus || !activeLesson || isCompleted) {
      const clearRaf = window.requestAnimationFrame(() => setFocusRects([]))
      return () => window.cancelAnimationFrame(clearRaf)
    }

    const update = () => {
      const targets = currentStep.focus?.(useStore.getState()) ?? []
      setFocusRects(rectsFromTargets(targets))
    }

    update()
    const raf = window.requestAnimationFrame(update)
    const resizeHandler = () => update()
    window.addEventListener('resize', resizeHandler)
    window.addEventListener('scroll', resizeHandler, true)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resizeHandler)
      window.removeEventListener('scroll', resizeHandler, true)
    }
  }, [
    activeLesson,
    currentStep,
    isCompleted,
    tutorialStepIndex,
    modules,
    cables,
    definitions,
    subpatchContext,
  ])

  const panelVisible = tutorialPanelOpen || !!activeTutorialId

  if (!panelVisible) return null

  function handleStartLesson(lessonId: string) {
    const state = useStore.getState()
    const hasPatchContent =
      Object.keys(state.modules).length > 0 ||
      Object.keys(state.cables).length > 0

    if (
      hasPatchContent &&
      !window.confirm(
        'start tutorial and clear current patch? unsaved work will be lost.',
      )
    ) {
      return
    }

    state.exitToRoot()
    state.clearPatch()
    startTutorial(lessonId)
  }

  return (
    <>
      {!!activeTutorialId && !isCompleted && focusRects.length > 0 && (
        <div className={styles.spotlightLayer}>
          {focusRects.map((rect) => {
            const style = {
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            } as CSSProperties
            return (
              <div key={rect.key} className={styles.spotlight} style={style} />
            )
          })}
        </div>
      )}

      <div className={classes(floatingPanelBaseStyles.panelBase, styles.panel)}>
        <div className={floatingPanelBaseStyles.headerRowBase}>
          <div className={styles.title}>tutorials</div>
          <button
            className={classes(
              controlPrimitiveStyles.buttonBase,
              controlPrimitiveStyles.buttonTertiary,
              styles.linkButton,
            )}
            onClick={() => {
              if (activeTutorialId) stopTutorial()
              setTutorialPanelOpen(false)
            }}
            type='button'
          >
            close
          </button>
        </div>

        {!activeTutorialId && (
          <>
            <div className={styles.modeRow}>
              <button
                type='button'
                className={classes(
                  controlPrimitiveStyles.buttonBase,
                  tutorialMode === 'beginner'
                    ? controlPrimitiveStyles.buttonPrimary
                    : controlPrimitiveStyles.buttonSecondary,
                )}
                onClick={() => setTutorialMode('beginner')}
              >
                beginner
              </button>
              <button
                type='button'
                className={classes(
                  controlPrimitiveStyles.buttonBase,
                  tutorialMode === 'veteran'
                    ? controlPrimitiveStyles.buttonPrimary
                    : controlPrimitiveStyles.buttonSecondary,
                )}
                onClick={() => setTutorialMode('veteran')}
              >
                veteran
              </button>
            </div>

            <div className={styles.lessonList}>
              {lessons.map((lesson) => {
                const completedAt = tutorialCompletion[lesson.id]
                return (
                  <div key={lesson.id} className={styles.lessonCard}>
                    <div className={styles.lessonTitleRow}>
                      <span>{lesson.title}</span>
                      {completedAt && (
                        <span className={styles.lessonBadge}>done</span>
                      )}
                    </div>
                    <p className={styles.lessonSummary}>{lesson.summary}</p>
                    <div className={styles.lessonMeta}>
                      {lesson.steps.length} step
                      {lesson.steps.length === 1 ? '' : 's'}
                    </div>
                    <div className={styles.lessonActions}>
                      <button
                        type='button'
                        className={classes(
                          controlPrimitiveStyles.buttonBase,
                          controlPrimitiveStyles.buttonPrimary,
                        )}
                        onClick={() => handleStartLesson(lesson.id)}
                      >
                        start
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {activeTutorialId && activeLesson && (
          <>
            <div className={styles.lessonTitle}>{activeLesson.title}</div>

            {!isCompleted && currentStep && (
              <>
                <div className={styles.stepMeta}>
                  step {tutorialStepIndex + 1} / {activeLesson.steps.length}
                </div>
                <div className={styles.sectionLabel}>next action</div>
                <p className={styles.bodyText}>{currentStep.action}</p>

                <div className={styles.sectionLabel}>why it matters</div>
                <p className={styles.bodyText}>{currentStep.why}</p>

                <div className={styles.sectionLabel}>hints</div>
                <p className={styles.bodyText}>
                  {tutorialHint ??
                    currentStep.hints[0] ??
                    'follow the highlighted targets.'}
                </p>

                <div className={floatingPanelBaseStyles.footerBase}>
                  <button
                    type='button'
                    className={classes(
                      controlPrimitiveStyles.buttonBase,
                      controlPrimitiveStyles.buttonPrimary,
                    )}
                    onClick={() => tryCurrentTutorialStep()}
                  >
                    try for me
                  </button>
                  <button
                    type='button'
                    className={classes(
                      controlPrimitiveStyles.buttonBase,
                      controlPrimitiveStyles.buttonSecondary,
                    )}
                    onClick={() => setTutorialShowDemo(!tutorialShowDemo)}
                  >
                    {tutorialShowDemo ? 'hide demo' : 'show me how'}
                  </button>
                </div>

                {tutorialShowDemo && (
                  <div className={styles.demoBox}>{currentStep.demo}</div>
                )}
              </>
            )}

            {isCompleted && (
              <>
                <div className={styles.completeTitle}>lesson complete</div>
                <p className={styles.bodyText}>
                  {activeLesson.completionMessage ??
                    'nice work. you can replay this lesson any time.'}
                </p>
              </>
            )}

            <div className={floatingPanelBaseStyles.footerBase}>
              <button
                type='button'
                className={classes(
                  controlPrimitiveStyles.buttonBase,
                  controlPrimitiveStyles.buttonSecondary,
                )}
                onClick={() => {
                  stopTutorial()
                  setTutorialPanelOpen(true)
                }}
              >
                back to lessons
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
