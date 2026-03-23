/**
 * CanvasManager — owns the pages and the TextFrame instances.
 */

import { state, uid } from './state.js'
import { TextFrame } from './TextFrame.js'
import { flowText } from './TextFlow.js'

const PX_PER_MM = 3.7795275591
const PAGE_W    = 210   // mm (A4)
const PAGE_H    = 297   // mm (A4)

export class CanvasManager {
  constructor(canvasEl) {
    this.el    = canvasEl
    this.pages = []     // array of HTMLElement
    this._addPage()
  }

  // ───────────────────────────────────────────
  // Pages
  // ───────────────────────────────────────────

  _addPage() {
    const z     = state.zoom
    const page  = document.createElement('div')
    page.className = 'page'
    page.style.width  = px(PAGE_W * z)
    page.style.height = px(PAGE_H * z)

    const label = document.createElement('div')
    label.className   = 'page-label'
    label.textContent = 'עמוד ' + (this.pages.length + 1)
    page.appendChild(label)

    this.el.appendChild(page)
    this.pages.push(page)
    return page
  }

  addPage() {
    return this._addPage()
  }

  /** Return page element by 0-based index (default: 0) */
  page(idx = 0) {
    return this.pages[idx] ?? this.pages[0]
  }

  // ───────────────────────────────────────────
  // Frames
  // ───────────────────────────────────────────

  /**
   * Create a new TextFrame on a page.
   * @param {{ pageEl?:HTMLElement, x:number, y:number, w:number, h:number }} opts
   */
  createFrame({ pageEl, x, y, w, h } = {}) {
    const id    = uid()
    const frame = new TextFrame({
      id,
      pageEl: pageEl ?? this.page(),
      x, y, w, h,
    })
    state.frames.set(id, frame)
    return frame
  }

  /**
   * Link `fromId` -> `toId` for text threading.
   * Re-flows from the chain head after linking.
   */
  threadFrames(fromId, toId) {
    const from = state.frames.get(fromId)
    const to   = state.frames.get(toId)
    if (!from || !to || fromId === toId) return
    if (from.linkedTo) return  // already linked — user must unlink first

    from.linkedTo   = toId
    to.linkedFrom   = fromId

    const head = from.isChainHead ? from : state.frames.get(from._chainHead().id)
    if (head?.content) flowText(head, state.frames)
  }

  /**
   * Remove a frame and patch up any thread chain it was part of.
   */
  deleteFrame(id) {
    const frame = state.frames.get(id)
    if (!frame) return

    // Patch chain: prev -> next (skip this frame)
    if (frame.linkedFrom) {
      const prev = state.frames.get(frame.linkedFrom)
      if (prev) prev.linkedTo = frame.linkedTo ?? null
    }
    if (frame.linkedTo) {
      const next = state.frames.get(frame.linkedTo)
      if (next) next.linkedFrom = frame.linkedFrom ?? null
    }

    frame.destroy()
    state.frames.delete(id)
  }

  // ───────────────────────────────────────────
  // Zoom
  // ───────────────────────────────────────────

  applyZoom() {
    const z = state.zoom
    this.pages.forEach(p => {
      p.style.width  = px(PAGE_W * z)
      p.style.height = px(PAGE_H * z)
    })
    state.frames.forEach(f => f.onZoom())
  }
}

const px = n => (n * PX_PER_MM).toFixed(2) + 'px'
