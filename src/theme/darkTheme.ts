import type { Theme } from './tokens'

export const darkTheme: Theme = {
  id: 'dark',
  name: 'dark',
  shades: {
    shade0: '#0d0d0f',
    shade1: '#161618',
    shade2: '#5a5a62',
    shade3: '#e8e8ec',
  },
  accents: {
    accent0: '#7c6af7',  // violet — primary
    accent1: '#3dd9a4',  // green — cv / modulation
    accent2: '#f25f5c',  // red — gates / triggers / alerts
    accent3: '#f5c842',  // amber — special / warnings
  },
  cables: {
    audio:   '#7c6af7',
    cv:      '#3dd9a4',
    gate:    '#f25f5c',
    trigger: '#f5c842',
  }
}
