/**
 * main.js — App entry point.
 * Wires together all modules and handles all UI events.
 */

import { state }          from './state.js'
import { CanvasManager }  from './Canvas.js'
import { LayoutEngine }   from './LayoutEngine.js'

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const PX_PER_MM   = 3.7795275591
const ZOOM_STEP   = 0.1
const ZOOM_MIN    = 0.2
const ZOOM_MAX    = 3.0
const MIN_FRAME_W = 8    // mm
const MIN_FRAME_H = 8    // mm

// ─────────────────────────────────────────────
// App state (local to this module)
// ─────────────────────────────────────────────

let canvas       = null
let selectedFrame = null

// Drawing a new frame
let drawing = null   // { pageEl, startX, startY, previewEl }

// Dragging an existing frame
let dragging = null  // { frame, startX, startY, origX, origY }

// Resizing a frame
let resizing = null  // { frame, dir, startX, startY, origX, origY, origW, origH }

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  canvas = new CanvasManager(document.getElementById('canvas'))
  bindAll()
})

// ─────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────

function bindAll() {
  // Tools
  document.querySelectorAll('.tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool))
  })

  // Keyboard shortcuts
  document.addEventListener('keydown', onKey)

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click',  () => adjustZoom(+ZOOM_STEP))
  document.getElementById('btn-zoom-out').addEventListener('click', () => adjustZoom(-ZOOM_STEP))

  // Add page
  document.getElementById('btn-add-page').addEventListener('click', () => canvas.addPage())

  // Import
  document.getElementById('btn-import').addEventListener('click',        openModal)
  document.getElementById('btn-modal-close').addEventListener('click',   closeModal)
  document.getElementById('btn-cancel-import').addEventListener('click', closeModal)
  document.getElementById('btn-do-import').addEventListener('click',     doImport)
  document.querySelectorAll('.mtab').forEach(t => {
    t.addEventListener('click', () => switchModalTab(t.dataset.tab))
  })

  // File drop / browse
  const fi = document.getElementById('file-input')
  const dz = document.getElementById('dropzone')
  document.getElementById('btn-browse').addEventListener('click', e => { e.stopPropagation(); fi.click() })
  fi.addEventListener('change', e => readFile(e.target.files[0]))
  dz.addEventListener('click',     () => fi.click())
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('dragover') })
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'))
  dz.addEventListener('drop',      e => { e.preventDefault(); dz.classList.remove('dragover'); readFile(e.dataTransfer.files[0]) })

  // Export
  document.getElementById('btn-export').addEventListener('click', exportPDF)

  // AI Layout
  document.getElementById('btn-ai').addEventListener('click', runAI)

  // Canvas mouse
  document.getElementById('workspace').addEventListener('mousedown', onMouseDown)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup',   onMouseUp)

  // Inspector inputs — live update
  const propIds = ['pi-x','pi-y','pi-w','pi-h','pi-font','pi-size','pi-lh']
  propIds.forEach(id => {
    document.getElementById(id).addEventListener('change', syncFromInspector)
  })

  // Inspector buttons
  document.getElementById('btn-thread').addEventListener('click',       startThreadMode)
  document.getElementById('btn-delete-frame').addEventListener('click', deleteSelected)
  document.getElementById('btn-cancel-thread').addEventListener('click', cancelThread)
}

// ─────────────────────────────────────────────
// Tool selection
// ─────────────────────────────────────────────

function setTool(tool) {
  state.tool = tool
  document.querySelectorAll('.tool[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool)
  })
  const ws = document.getElementById('workspace')
  ws.classList.toggle('tool-frame', tool === 'frame')
}

// ─────────────────────────────────────────────
// Keyboard
// ─────────────────────────────────────────────

function onKey(e) {
  const tag = e.target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  switch (e.key) {
    case 'v': case 'V': setTool('select'); break
    case 'f': case 'F': setTool('frame');  break
    case 'a': case 'A': runAI();           break
    case 'Escape':
      if (state.threadingFrom) cancelThread()
      else deselect()
      break
    case 'Delete':
    case 'Backspace':
      if (selectedFrame) deleteSelected()
      break
  }
}

// ─────────────────────────────────────────────
// Zoom
// ─────────────────────────────────────────────

function adjustZoom(delta) {
  state.zoom = clamp(state.zoom + delta, ZOOM_MIN, ZOOM_MAX)
  document.getElementById('zoom-label').textContent = Math.round(state.zoom * 100) + '%'
  canvas.applyZoom()
  if (selectedFrame) updateInspector(selectedFrame)
}

// ─────────────────────────────────────────────
// Mouse events
// ─────────────────────────────────────────────

function onMouseDown(e) {
  const frameEl  = e.target.closest('.text-frame')
  const handleEl = e.target.closest('.rh')

  // ── Thread mode: click target frame ──────
  if (state.threadingFrom) {
    if (frameEl && frameEl.dataset.id !== state.threadingFrom) {
      canvas.threadFrames(state.threadingFrom, frameEl.dataset.id)
      cancelThread()
    }
    return
  }

  // ── Frame tool: start drawing ─────────────
  if (state.tool === 'frame') {
    const pageEl = e.target.closest('.page')
    if (!pageEl) return
    e.preventDefault()

    const { mmX, mmY } = clientToMm(e.clientX, e.clientY, pageEl)
    const preview = document.createElement('div')
    preview.style.cssText = [
      'position:absolute',
      'border:1.5px dashed #0077ff',
      'background:rgba(0,119,255,0.06)',
      'pointer-events:none',
      'z-index:10',
    ].join(';')
    pageEl.appendChild(preview)

    drawing = { pageEl, startX: mmX, startY: mmY, endX: mmX, endY: mmY, preview }
    return
  }

  // ── Resize handle ─────────────────────────
  if (handleEl && selectedFrame) {
    e.preventDefault()
    resizing = {
      frame:  selectedFrame,
      dir:    handleEl.dataset.resize,
      startX: e.clientX,
      startY: e.clientY,
      origX:  selectedFrame.x,
      origY:  selectedFrame.y,
      origW:  selectedFrame.w,
      origH:  selectedFrame.h,
    }
    return
  }

  // ── Select / drag frame ───────────────────
  if (frameEl) {
    e.preventDefault()
    const frame = state.frames.get(frameEl.dataset.id)
    if (frame) {
      selectFrame(frame)
      dragging = {
        frame,
        startX: e.clientX,
        startY: e.clientY,
        origX:  frame.x,
        origY:  frame.y,
      }
    }
    return
  }

  // ── Click empty canvas — deselect ─────────
  if (!e.target.closest('#inspector')) deselect()
}

function onMouseMove(e) {
  if (drawing) {
    const { mmX, mmY } = clientToMm(e.clientX, e.clientY, drawing.pageEl)
    drawing.endX = mmX
    drawing.endY = mmY

    const x = Math.min(drawing.startX, mmX)
    const y = Math.min(drawing.startY, mmY)
    const w = Math.abs(mmX - drawing.startX)
    const h = Math.abs(mmY - drawing.startY)

    const z = state.zoom
    const p = drawing.preview.style
    p.left   = mmToPx(x, z)
    p.top    = mmToPx(y, z)
    p.width  = mmToPx(w, z)
    p.height = mmToPx(h, z)
    return
  }

  if (dragging) {
    const z  = state.zoom
    const dx = (e.clientX - dragging.startX) / (PX_PER_MM * z)
    const dy = (e.clientY - dragging.startY) / (PX_PER_MM * z)
    dragging.frame.setProps({ x: dragging.origX + dx, y: dragging.origY + dy })
    updateInspector(dragging.frame)
    return
  }

  if (resizing) {
    applyResize(e)
    updateInspector(resizing.frame)
  }
}

function onMouseUp(e) {
  if (drawing) {
    drawing.preview.remove()
    const x = Math.min(drawing.startX, drawing.endX)
    const y = Math.min(drawing.startY, drawing.endY)
    const w = Math.abs(drawing.endX - drawing.startX)
    const h = Math.abs(drawing.endY - drawing.startY)

    if (w >= MIN_FRAME_W && h >= MIN_FRAME_H) {
      const frame = canvas.createFrame({ pageEl: drawing.pageEl, x, y, w, h })
      selectFrame(frame)

      // Auto-flow pending text
      if (state.pendingText) {
        frame.setContent(state.pendingText)
        state.pendingText = ''
      }
    }
    drawing = null
  }

  dragging = null
  resizing = null
}

function applyResize(e) {
  const { frame, dir, startX, startY, origX, origY, origW, origH } = resizing
  const z  = state.zoom
  const dx = (e.clientX - startX) / (PX_PER_MM * z)
  const dy = (e.clientY - startY) / (PX_PER_MM * z)

  let x = origX, y = origY, w = origW, h = origH

  // East = physical right → dragging right increases width
  if (dir.includes('e'))  w = Math.max(MIN_FRAME_W, origW + dx)
  // West = physical left → dragging right moves x & shrinks w
  if (dir.includes('w')) { x = origX + dx; w = Math.max(MIN_FRAME_W, origW - dx) }
  // South = bottom → dragging down increases height
  if (dir.includes('s'))  h = Math.max(MIN_FRAME_H, origH + dy)
  // North = top → dragging up moves y & shrinks h
  if (dir.includes('n')) { y = origY + dy; h = Math.max(MIN_FRAME_H, origH - dy) }

  frame.setProps({ x, y, w, h })
}

// ─────────────────────────────────────────────
// Frame selection
// ─────────────────────────────────────────────

function selectFrame(frame) {
  if (selectedFrame && selectedFrame !== frame) selectedFrame.deselect()
  selectedFrame = frame
  state.selectedId = frame.id
  frame.select()
  updateInspector(frame)
}

function deselect() {
  if (selectedFrame) selectedFrame.deselect()
  selectedFrame    = null
  state.selectedId = null
  document.getElementById('ins-empty').classList.remove('hidden')
  document.getElementById('ins-frame').classList.add('hidden')
}

function deleteSelected() {
  if (!selectedFrame) return
  const id = selectedFrame.id
  selectedFrame = null
  state.selectedId = null
  canvas.deleteFrame(id)
  document.getElementById('ins-empty').classList.remove('hidden')
  document.getElementById('ins-frame').classList.add('hidden')
}

// ─────────────────────────────────────────────
// Inspector sync
// ─────────────────────────────────────────────

function updateInspector(frame) {
  document.getElementById('ins-empty').classList.add('hidden')
  document.getElementById('ins-frame').classList.remove('hidden')

  document.getElementById('pi-x').value    = Math.round(frame.x)
  document.getElementById('pi-y').value    = Math.round(frame.y)
  document.getElementById('pi-w').value    = Math.round(frame.w)
  document.getElementById('pi-h').value    = Math.round(frame.h)
  document.getElementById('pi-font').value = frame.font
  document.getElementById('pi-size').value = frame.fontSize
  document.getElementById('pi-lh').value   = frame.lineHeight

  const info = document.getElementById('thread-info')
  if (frame.linkedTo)   info.textContent = `→ מחובר ל-${frame.linkedTo}`
  else if (frame.linkedFrom) info.textContent = `← מקבל מ-${frame.linkedFrom}`
  else info.textContent = ''
}

function syncFromInspector() {
  if (!selectedFrame) return
  selectedFrame.setProps({
    x:          +document.getElementById('pi-x').value,
    y:          +document.getElementById('pi-y').value,
    w:          +document.getElementById('pi-w').value,
    h:          +document.getElementById('pi-h').value,
    font:        document.getElementById('pi-font').value,
    fontSize:   +document.getElementById('pi-size').value,
    lineHeight: +document.getElementById('pi-lh').value,
  })
}

// ─────────────────────────────────────────────
// Thread mode
// ─────────────────────────────────────────────

function startThreadMode() {
  if (!selectedFrame) return
  state.threadingFrom = selectedFrame.id
  document.getElementById('thread-banner').classList.remove('hidden')
  state.frames.forEach((f, id) => {
    if (id !== state.threadingFrom) f.markAsTarget()
  })
}

function cancelThread() {
  state.threadingFrom = null
  document.getElementById('thread-banner').classList.add('hidden')
  state.frames.forEach(f => f.clearTarget())
}

// ─────────────────────────────────────────────
// Import modal
// ─────────────────────────────────────────────

function openModal()  { document.getElementById('modal-overlay').classList.remove('hidden') }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden') }

function switchModalTab(tab) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))
  document.getElementById('tab-paste').classList.toggle('hidden', tab !== 'paste')
  document.getElementById('tab-file').classList.toggle('hidden',  tab !== 'file')
}

function readFile(file) {
  if (!file) return
  if (file.name.endsWith('.docx')) {
    const reader = new FileReader()
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(r => {
          document.getElementById('import-ta').value = r.value
          switchModalTab('paste')
        })
    }
    reader.readAsArrayBuffer(file)
  } else {
    const reader = new FileReader()
    reader.onload = e => {
      document.getElementById('import-ta').value = e.target.result
      switchModalTab('paste')
    }
    reader.readAsText(file, 'UTF-8')
  }
}

function doImport() {
  const text = document.getElementById('import-ta').value.trim()
  if (!text) return
  closeModal()

  // Flow into selected frame, or first frame, or store as pending
  const target = selectedFrame
    ?? (state.frames.size > 0 ? state.frames.values().next().value : null)

  if (target) {
    target.setContent(text)
  } else {
    state.pendingText = text
    setTool('frame')     // Switch to frame tool so user draws a frame
  }
}

// ─────────────────────────────────────────────
// AI Auto-Layout
// ─────────────────────────────────────────────

function runAI() {
  // Collect text from the first chain head, pending text, or ask user to import
  let text = state.pendingText

  if (!text) {
    state.frames.forEach(f => {
      if (f.isChainHead && f.content) text = f.content
    })
  }

  if (!text) {
    openModal()
    return
  }

  // Show spinner
  const spinner = document.createElement('div')
  spinner.className = 'ai-spinner'
  spinner.innerHTML = '<i class="fas fa-circle-notch"></i><span>ה-AI מנתח ומעמד...</span>'
  document.body.appendChild(spinner)

  // Clear existing frames
  const ids = [...state.frames.keys()]
  ids.forEach(id => canvas.deleteFrame(id))
  deselect()

  // Run layout (next tick so spinner renders)
  setTimeout(() => {
    try {
      const { analysis } = LayoutEngine.autoLayout(text, canvas)
      state.pendingText = ''
      console.log('AI layout:', analysis.layout.description)
    } catch (err) {
      console.error('AI layout error:', err)
    } finally {
      spinner.remove()
    }
  }, 50)
}

// ─────────────────────────────────────────────
// PDF Export
// ─────────────────────────────────────────────

function exportPDF() {
  // Temporarily hide chrome
  const chrome = [...document.querySelectorAll('.rh, .overflow-dot')]
  chrome.forEach(el => { el.style.visibility = 'hidden' })
  document.querySelectorAll('.text-frame').forEach(el => el.classList.remove('selected'))

  const page = canvas.page(0)
  const opt  = {
    margin:    0,
    filename:  'mikra-ai.pdf',
    image:     { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF:     { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }

  html2pdf().set(opt).from(page).save().then(() => {
    chrome.forEach(el => { el.style.visibility = '' })
    if (selectedFrame) selectedFrame.select()
  })
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function clientToMm(clientX, clientY, pageEl) {
  const rect = pageEl.getBoundingClientRect()
  const z    = state.zoom
  return {
    mmX: (clientX - rect.left)  / (PX_PER_MM * z),
    mmY: (clientY - rect.top)   / (PX_PER_MM * z),
  }
}

function mmToPx(mm, z) {
  return (mm * PX_PER_MM * z).toFixed(2) + 'px'
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}
