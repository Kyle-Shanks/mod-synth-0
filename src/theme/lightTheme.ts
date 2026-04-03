import type { Theme } from './tokens'

export const lightTheme: Theme = {
  id: 'light',
  name: 'light',
  shades: {
    shade0: '#f0eff5',
    shade1: '#e4e3ec',
    shade2: '#9a9aaa',
    shade3: '#1a1a2e',
  },
  accents: {
    accent0: '#5b4de0',
    accent1: '#1aa87a',
    accent2: '#d63b38',
    accent3: '#c49a00',
  },
  cables: {
    audio:   '#5b4de0',
    cv:      '#1aa87a',
    gate:    '#d63b38',
    trigger: '#c49a00',
  },
}
