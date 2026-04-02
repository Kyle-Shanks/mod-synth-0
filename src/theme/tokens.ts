export interface Theme {
  id: string
  name: string

  shades: {
    shade0: string  // background
    shade1: string  // module panel surface
    shade2: string  // inactive elements, borders
    shade3: string  // highest contrast — output port insets, active elements, text
  }

  accents: {
    accent0: string  // primary highlight
    accent1: string  // secondary
    accent2: string  // tertiary
    accent3: string  // alert / special
  }

  cables: {
    audio: string
    cv: string
    gate: string
    trigger: string
  }
}

export const GRID_UNIT = 48    // rack grid unit in px at 100% zoom
export const SUB_GRID = 8      // sub-grid for module internal layout
export const BUFFER_SIZE = 128
