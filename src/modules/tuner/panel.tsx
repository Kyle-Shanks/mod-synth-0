import { useMemo, useEffect } from 'react'
import { useStore } from '../../store'
import { internalWorkletId } from '../../store/subpatchSlice'
import { TunerDisplay } from '../../components/TunerDisplay'

interface TunerPanelProps {
  moduleId: string
}

export function TunerPanel({ moduleId }: TunerPanelProps) {
  const currentInstanceId = useStore(
    (s) => s.subpatchContext[s.subpatchContext.length - 1]?.instanceId,
  )
  const engineRevision = useStore((s) => s.engineRevision)
  const setTunerBuffer = useStore((s) => s.setTunerBuffer)
  const workletModuleId = currentInstanceId
    ? internalWorkletId(currentInstanceId, moduleId)
    : moduleId

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
    setTunerBuffer(workletModuleId, tunerBuffer.buffer as SharedArrayBuffer)
  }, [workletModuleId, tunerBuffer, engineRevision, setTunerBuffer])

  return <TunerDisplay moduleId={moduleId} tunerBuffer={tunerBuffer} />
}
