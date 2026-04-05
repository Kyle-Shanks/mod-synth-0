import { useMemo, useEffect } from 'react'
import { useStore } from '../../store'
import { TunerDisplay } from '../../components/TunerDisplay'

interface TunerPanelProps {
  moduleId: string
}

export function TunerPanel({ moduleId }: TunerPanelProps) {
  const engineRevision = useStore((s) => s.engineRevision)
  const setTunerBuffer = useStore((s) => s.setTunerBuffer)

  const tunerBuffer = useMemo(() => {
    try {
      const sab = new SharedArrayBuffer(2 * Float32Array.BYTES_PER_ELEMENT)
      return new Float32Array(sab)
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!tunerBuffer) return
    setTunerBuffer(moduleId, tunerBuffer.buffer as SharedArrayBuffer)
  }, [moduleId, tunerBuffer, engineRevision, setTunerBuffer])

  return <TunerDisplay moduleId={moduleId} tunerBuffer={tunerBuffer} />
}
