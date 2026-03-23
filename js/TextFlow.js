/**
 * TextFlow — measures how much text fits in a frame and
 * distributes the full text through a threaded chain of frames.
 *
 * Uses a hidden off-screen div for measurement (no canvas API needed).
 */

const PX_PER_MM = 3.7795275591

/**
 * Flow `text` starting from `headFrame`, distributing through
 * linked frames in order.
 *
 * @param {TextFrame} headFrame
 * @param {Map<string,TextFrame>} framesMap
 */
export function flowText(headFrame, framesMap) {
  let remaining = headFrame.content
  let current = headFrame

  while (current) {
    const { fitted, overflow } = measureFit(current, remaining)
    current._setVisible(fitted, overflow.length > 0)
    remaining = overflow

    if (!current.linkedTo) break
    current = framesMap.get(current.linkedTo)
    if (!current) break
  }
}

/**
 * Measure how much of `text` fits inside `frame`.
 * Returns { fitted: string, overflow: string }
 */
function measureFit(frame, text) {
  if (!text) return { fitted: '', overflow: '' }

  const widthPx  = frame.w * PX_PER_MM
  const heightPx = frame.h * PX_PER_MM

  const div = createMeasureDiv(frame, widthPx)
  document.body.appendChild(div)

  // Quick check: does everything fit?
  div.textContent = text
  if (div.scrollHeight <= heightPx + 1) {
    document.body.removeChild(div)
    return { fitted: text, overflow: '' }
  }

  // Binary search for the character index where text overflows
  let lo = 0
  let hi = text.length

  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    div.textContent = text.slice(0, mid)
    if (div.scrollHeight <= heightPx + 1) {
      lo = mid
    } else {
      hi = mid
    }
  }

  document.body.removeChild(div)

  // Snap to the nearest word boundary before `lo`
  let breakAt = lo
  while (breakAt > 0 && text[breakAt] !== ' ' && text[breakAt] !== '\n') {
    breakAt--
  }
  if (breakAt === 0) breakAt = lo  // no space found — hard break

  const fitted   = text.slice(0, breakAt)
  const overflow = text.slice(breakAt).replace(/^[ \t]+/, '')

  return { fitted, overflow }
}

function createMeasureDiv(frame, widthPx) {
  const d = document.createElement('div')
  d.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'left:-9999px',
    'top:-9999px',
    `width:${widthPx}px`,
    'max-height:none',
    'padding:4px 6px',
    'box-sizing:border-box',
    `font-family:${frame.font}`,
    `font-size:${frame.fontSize}pt`,
    `line-height:${frame.lineHeight}`,
    'direction:rtl',
    'text-align:right',
    'word-break:break-word',
    'white-space:pre-wrap',
  ].join(';')
  return d
}
