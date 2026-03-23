/**
 * Analyzer — rule-based text analysis for Hebrew religious texts.
 *
 * Returns structured metadata used by LayoutEngine to decide
 * font sizes, column count, and other typographic parameters.
 *
 * This module is designed as a Claude API integration point:
 * replace `analyzeWithRules` with an API call when a key is available.
 */

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export const Analyzer = {
  /**
   * @param {string} text
   * @returns {{ segments, stats, layout }}
   */
  analyze(text) {
    const segments = segmentText(text)
    const stats    = computeStats(text, segments)
    const layout   = suggestLayout(segments, stats)
    return { segments, stats, layout }
  }
}

// ─────────────────────────────────────────────
// Segmentation
// ─────────────────────────────────────────────

const PATTERNS = {
  siman:    /^(סימן|פרק|הלכה)\s/,
  question: /^(שאלה|נשאלתי|שאל)/,
  answer:   /^(תשובה|תשו'|הנה)/,
  dibur:    /^ד["\u05F4]ה\s/,
  ref:      /\([\u05D0-\u05EA "'.,:]+\)/,
}

function classifyLine(line) {
  const t = line.trim()
  if (!t) return 'empty'
  if (PATTERNS.siman.test(t))    return 'siman'
  if (PATTERNS.question.test(t)) return 'question'
  if (PATTERNS.answer.test(t))   return 'answer'
  if (PATTERNS.dibur.test(t))    return 'dibur'
  if (t.length < 35 && !t.endsWith('.') && !t.endsWith(',')) return 'header'
  return 'paragraph'
}

function segmentText(text) {
  return text.split('\n').map(line => ({
    type: classifyLine(line),
    text: line,
  }))
}

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

function computeStats(text, segments) {
  const words      = text.trim().split(/\s+/).filter(Boolean).length
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim()).length
  const types      = countTypes(segments)
  return { words, paragraphs, types }
}

function countTypes(segments) {
  const counts = {}
  segments.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1 })
  return counts
}

// ─────────────────────────────────────────────
// Layout Suggestion
// ─────────────────────────────────────────────

function suggestLayout(segments, stats) {
  const t = stats.types

  const isHalachic  = (t.siman   || 0) > 0
  const isResponsa  = (t.question|| 0) > 0 || (t.answer || 0) > 0
  const hasDibur    = (t.dibur   || 0) > 0
  const isDense     = stats.words > 800

  if (hasDibur || isHalachic) {
    return {
      columns:     2,
      fontSize:    9.5,
      lineHeight:  1.35,
      marginMm:    12,
      description: 'ספרות הלכה — שתי עמודות, גופן קטן',
    }
  }

  if (isResponsa) {
    return {
      columns:     1,
      fontSize:    11,
      lineHeight:  1.5,
      marginMm:    18,
      description: 'שו"ת — עמודה אחת',
    }
  }

  if (isDense) {
    return {
      columns:     2,
      fontSize:    10,
      lineHeight:  1.4,
      marginMm:    14,
      description: 'טקסט ארוך — שתי עמודות',
    }
  }

  return {
    columns:     1,
    fontSize:    12,
    lineHeight:  1.6,
    marginMm:    20,
    description: 'טקסט רגיל — עמודה אחת',
  }
}
