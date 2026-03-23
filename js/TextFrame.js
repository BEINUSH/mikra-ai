/**
 * TextFrame — a single positionable text box on a page.
 *
 * Coordinates (x, y, w, h) are in millimetres.
 * DOM layout is in pixels (converted on render/zoom).
 */

import { state } from './state.js'
import { flowText } from './TextFlow.js'

const PX_PER_MM = 3.7795275591
const HANDLES = ['nw','n','ne','e','se','s','sw','w']

export class TextFrame {
  /**
   * @param {{ id:string, pageEl:HTMLElement, x:number, y:number, w:number, h:number }}
   */
  constructor({ id, pageEl, x, y, w, h }) {
    this.id       = id
    this.pageEl   = pageEl
    this.x        = x      // mm
    this.y        = y      // mm
    this.w        = w      // mm
    this.h        = h      // mm

    // Content
    this.content  = ''     // full text owned by this frame (chain head only)
    this.linkedTo   = null // id of next frame in thread chain
    this.linkedFrom = null // id of previous frame in thread chain

    // Typography
    this.font       = 'Frank Ruhl Libre'
    this.fontSize   = 11    // pt
    this.lineHeight = 1.5

    this.el = null
    this._build()
  }

  // ───────────────────────────────────────────
  // Build DOM
  // ───────────────────────────────────────────

  _build() {
    const el = document.createElement('div')
    el.className    = 'text-frame'
    el.dataset.id   = this.id

    const content = document.createElement('div')
    content.className = 'frame-content'
    this._applyTypo(content)
    el.appendChild(content)

    this.el      = el
    this.pageEl.appendChild(el)
    this._positionEl()
  }

  _applyTypo(el = this.el.querySelector('.frame-content')) {
    el.style.fontFamily  = this.font
    el.style.fontSize    = this.fontSize + 'pt'
    el.style.lineHeight  = this.lineHeight
  }

  _positionEl() {
    const z = state.zoom
    const s = this.el.style
    s.left   = px(this.x * z)
    s.top    = px(this.y * z)
    s.width  = px(this.w * z)
    s.height = px(this.h * z)
  }

  // ───────────────────────────────────────────
  // Content & Flow
  // ───────────────────────────────────────────

  /** Set full text on this frame (must be chain head) and re-flow. */
  setContent(text) {
    this.content = text
    flowText(this, state.frames)
  }

  /** Called by TextFlow — set the portion visible in this frame. */
  _setVisible(text, hasOverflow) {
    this.el.querySelector('.frame-content').textContent = text
    this._updateOverflowDot(hasOverflow && !this.linkedTo)
  }

  _updateOverflowDot(show) {
    let dot = this.el.querySelector('.overflow-dot')
    if (show) {
      if (!dot) {
        dot = document.createElement('div')
        dot.className = 'overflow-dot'
        dot.title     = 'יש גלישה — חבר לתיבה הבאה'
        dot.textContent = '+'
        this.el.appendChild(dot)
      }
    } else {
      dot?.remove()
    }
  }

  // ───────────────────────────────────────────
  // Selection & Handles
  // ───────────────────────────────────────────

  select() {
    this.el.classList.add('selected')
    HANDLES.forEach(dir => {
      const h = document.createElement('div')
      h.className      = `rh rh-${dir}`
      h.dataset.resize = dir
      this.el.appendChild(h)
    })
  }

  deselect() {
    this.el.classList.remove('selected')
    this.el.querySelectorAll('.rh').forEach(h => h.remove())
  }

  // ───────────────────────────────────────────
  // Properties
  // ───────────────────────────────────────────

  /**
   * Update one or more properties and re-render.
   * Pass only the keys you want to change.
   */
  setProps(patch) {
    let needReflow = false

    if (patch.x !== undefined) this.x = patch.x
    if (patch.y !== undefined) this.y = patch.y
    if (patch.w !== undefined) { this.w = patch.w; needReflow = true }
    if (patch.h !== undefined) { this.h = patch.h; needReflow = true }

    if (patch.font !== undefined) {
      this.font = patch.font
      this._applyTypo()
      needReflow = true
    }
    if (patch.fontSize !== undefined) {
      this.fontSize = patch.fontSize
      this._applyTypo()
      needReflow = true
    }
    if (patch.lineHeight !== undefined) {
      this.lineHeight = patch.lineHeight
      this._applyTypo()
      needReflow = true
    }

    this._positionEl()

    if (needReflow) {
      const head = this._chainHead()
      if (head.content) flowText(head, state.frames)
    }
  }

  /** Reposition when zoom changes. */
  onZoom() {
    this._positionEl()
  }

  // ───────────────────────────────────────────
  // Thread mode visual hints
  // ───────────────────────────────────────────

  markAsTarget()  { this.el.classList.add('thread-target') }
  clearTarget()   { this.el.classList.remove('thread-target') }

  // ───────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────

  _chainHead() {
    let cur = this
    while (cur.linkedFrom) {
      const prev = state.frames.get(cur.linkedFrom)
      if (!prev) break
      cur = prev
    }
    return cur
  }

  get isChainHead() {
    return !this.linkedFrom
  }

  destroy() {
    this.el.remove()
  }
}

const px = n => (n * PX_PER_MM).toFixed(2) + 'px'
