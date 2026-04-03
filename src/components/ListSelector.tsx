import { useStore } from '../store'
import type { ParamDefinition } from '../engine/types'

interface ListSelectorProps {
  moduleId: string
  paramId: string
  definition: ParamDefinition
  value: number
}

export function ListSelector({ moduleId, paramId, definition, value }: ListSelectorProps) {
  const setParam = useStore((s) => s.setParam)
  const options = definition.options ?? []
  const selectedIndex = Math.round(value)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      minWidth: 56,
    }}>
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--shade2)',
        marginBottom: 2,
        textAlign: 'center',
      }}>
        {definition.label}
      </div>
      {options.map((option, i) => (
        <div
          key={option}
          onClick={(e) => {
            e.stopPropagation()
            setParam(moduleId, paramId, i)
          }}
          style={{
            padding: '2px 6px',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            background: i === selectedIndex ? 'var(--shade3)' : 'transparent',
            color: i === selectedIndex ? 'var(--shade0)' : 'var(--shade2)',
            transition: 'background 80ms, color 80ms',
            lineHeight: 1.3,
            textAlign: 'center',
          }}
        >
          {i === selectedIndex ? '\u25b8 ' : '  '}{option}
        </div>
      ))}
    </div>
  )
}
