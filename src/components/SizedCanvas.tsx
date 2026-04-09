import { forwardRef } from 'react'
import type { CSSProperties, CanvasHTMLAttributes } from 'react'

interface SizedCanvasProps
  extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'width' | 'height'> {
  pixelWidth: number
  pixelHeight: number
}

export const SizedCanvas = forwardRef<HTMLCanvasElement, SizedCanvasProps>(
  function SizedCanvas(
    { pixelWidth, pixelHeight, style, ...rest },
    ref,
  ) {
    const sizedStyle: CSSProperties = {
      width: pixelWidth,
      height: pixelHeight,
      ...style,
    }

    return (
      <canvas
        ref={ref}
        width={pixelWidth}
        height={pixelHeight}
        style={sizedStyle}
        {...rest}
      />
    )
  },
)
