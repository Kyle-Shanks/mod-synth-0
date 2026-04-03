import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useStore } from '../store'

export function useZoom(outerRef: RefObject<HTMLDivElement | null>) {
  const zoom    = useStore((s) => s.zoom)
  const setZoom = useStore((s) => s.setZoom)

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // ctrlKey: trackpad pinch gesture; metaKey: cmd+scroll
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(zoom + -e.deltaY * 0.001)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [outerRef, zoom, setZoom])

  return zoom
}
