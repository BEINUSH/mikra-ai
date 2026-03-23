/**
 * Central app state — plain mutable object (no framework needed).
 * All modules import `state` directly and mutate as needed.
 */

export const state = {
  tool: 'select',       // 'select' | 'frame'
  zoom: 1.0,
  frames: new Map(),    // id -> TextFrame
  selectedId: null,
  threadingFrom: null,  // frame id when in thread-connect mode
  pendingText: '',      // text waiting to be flowed into a frame
  _uid: 1,
}

/** Generate a unique frame ID */
export function uid() {
  return 'f' + state._uid++
}
