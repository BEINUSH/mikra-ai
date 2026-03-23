/**
 * LayoutEngine — uses Analyzer output to automatically
 * place text frames on pages and flow text through them.
 *
 * Called when the user clicks the AI wand button.
 */

import { Analyzer } from './Analyzer.js'
import { flowText  } from './TextFlow.js'

const PAGE_W = 210   // mm A4
const PAGE_H = 297   // mm A4

export const LayoutEngine = {
  /**
   * Analyze text, build frames, thread them, flow text.
   *
   * @param {string}        text
   * @param {CanvasManager} canvas
   * @returns {{ frames: TextFrame[], analysis: object }}
   */
  autoLayout(text, canvas) {
    const analysis  = Analyzer.analyze(text)
    const { layout } = analysis

    const cols   = layout.columns
    const margin = layout.marginMm
    const gap    = 6          // mm between columns
    const usableW = PAGE_W - margin * 2
    const usableH = PAGE_H - margin * 2
    const colW   = cols > 1 ? (usableW - gap * (cols - 1)) / cols : usableW

    const pageEl = canvas.page(0)
    const frames = []

    for (let c = 0; c < cols; c++) {
      // RTL: first column (c=0) is on the RIGHT side of the page
      const x = margin + (cols - 1 - c) * (colW + gap)

      const frame = canvas.createFrame({ pageEl, x, y: margin, w: colW, h: usableH })
      frame.setProps({
        font:       'Frank Ruhl Libre',
        fontSize:   layout.fontSize,
        lineHeight: layout.lineHeight,
      })
      frames.push(frame)
    }

    // Thread: frame[0] -> frame[1] -> ...
    for (let i = 0; i < frames.length - 1; i++) {
      canvas.threadFrames(frames[i].id, frames[i + 1].id)
    }

    // Flow the text
    frames[0].setContent(text)

    return { frames, analysis }
  }
}
