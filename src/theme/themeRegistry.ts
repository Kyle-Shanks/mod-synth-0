import { abyssTheme } from './abyssTheme'
import { arcadeTheme } from './arcadeTheme'
import { braunTheme } from './braunTheme'
import { darkTheme } from './darkTheme'
import { forestTheme } from './forestTheme'
import { iceTheme } from './iceTheme'
import { lightTheme } from './lightTheme'
import { paperTheme } from './paperTheme'
import { slateTheme } from './slateTheme'
import { synthwaveTheme } from './synthwaveTheme'
import { volcanicTheme } from './volcanicTheme'
import type { Theme } from './tokens'

export const themes: Record<string, Theme> = {
  dark: darkTheme,
  forest: forestTheme,
  abyss: abyssTheme,
  volcanic: volcanicTheme,
  light: lightTheme,
  braun: braunTheme,
  synthwave: synthwaveTheme,
  ice: iceTheme,
  arcade: arcadeTheme,
  slate: slateTheme,
  paper: paperTheme,
}

export function getTheme(id: string): Theme {
  return themes[id] ?? darkTheme
}
