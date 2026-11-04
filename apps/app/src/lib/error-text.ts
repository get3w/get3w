export type NormalizeErrorTextOptions = {
  cap?: number
}

export type NormalizedErrorText = {
  display: string
  truncated: boolean
  originalLength: number
}

const DEFAULT_ERROR_TEXT_CAP = 4_096
const MIN_ERROR_TEXT_CAP = 256
const HTML_SCAN_LIMIT = 64 * 1_024

const HTTP_STATUS_LABELS: Readonly<Record<string, string>> = {
  "400": "Bad Request",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "Not Found",
  "408": "Request Timeout",
  "413": "Payload Too Large",
  "429": "Too Many Requests",
  "500": "Internal Server Error",
  "501": "Not Implemented",
  "502": "Bad Gateway",
  "503": "Service Unavailable",
  "504": "Gateway Timeout",
  "520": "Web Server Returned an Unknown Error",
  "522": "Connection Timed Out",
  "524": "A Timeout Occurred",
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatCharacterCount(length: number): string {
  return `${length.toLocaleString("en-US")} characters`
}

function formatHumanSize(length: number): string {
  if (length >= 1_024 * 1_024) return `${(length / (1_024 * 1_024)).toFixed(1)} MB`
  if (length >= 1_024) return `${(length / 1_024).toFixed(1)} KB`
  return `${length} characters`
}

function truncationMarker(originalLength: number): string {
  return `\n\n[Error text truncated; original size: ${formatCharacterCount(originalLength)}]`
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|#(\d+)|#x([\da-f]+));/gi, (entity, decimal: string | undefined, hex: string | undefined) => {
    const named: Readonly<Record<string, string>> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&#x27;": "'",
    }
    const replacement = named[entity.toLowerCase()]
    if (replacement) return replacement
    const codePoint = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? "", 16)
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10_FFFF
      ? String.fromCodePoint(codePoint)
      : entity
  })
}

function plainHtmlText(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

function htmlDocumentSummary(raw: string): string | null {
  const head = raw.slice(0, HTML_SCAN_LIMIT)
  const leading = head.trimStart()
  const lower = leading.toLowerCase()
  const tail = raw.slice(Math.max(0, raw.length - 2_048)).toLowerCase()
  const doctypeIndex = lower.indexOf("<!doctype")
  const htmlIndex = lower.indexOf("<html")
  const hasDocumentStart = doctypeIndex >= 0 && doctypeIndex < 1_024
    || htmlIndex >= 0 && htmlIndex < 1_024
  const hasDocumentStructure = /<(?:head|body)\b/i.test(leading)
    && /<\/(?:body|html)>/i.test(tail)
  if (!hasDocumentStart && !hasDocumentStructure) return null

  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)
  const title = titleMatch ? plainHtmlText(titleMatch[1] ?? "").slice(0, 160) : ""
  const statusSource = `${title} ${plainHtmlText(head)}`
  let status = ""
  for (const [code, label] of Object.entries(HTTP_STATUS_LABELS)) {
    if (new RegExp(`\\b${code}\\b`, "i").test(statusSource)) {
      status = `${code} ${label}`
      break
    }
  }

  const detail = status
    ? ` (${status})`
    : title
      ? ` (“${title}”)`
      : ""
  return `Upstream returned an HTML error page${detail} — ${formatHumanSize(raw.length)} hidden`
}

function jsonRecordRange(raw: string): { start: number; end: number } | null {
  const scanEnd = Math.min(raw.length, HTML_SCAN_LIMIT)
  const start = raw.indexOf("{", 0)
  if (start < 0 || start >= scanEnd) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < scanEnd; index += 1) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === "{") depth += 1
    if (character !== "}") continue
    depth -= 1
    if (depth !== 0) continue

    const end = index + 1
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end))
      return isRecord(parsed) ? { start, end } : null
    } catch {
      return null
    }
  }
  return null
}

function clampWithMarker(raw: string, cap: number, originalLength: number): string {
  const marker = truncationMarker(originalLength)
  const contentCap = cap - marker.length
  const jsonRange = jsonRecordRange(raw)
  if (jsonRange) {
    const jsonLength = jsonRange.end - jsonRange.start
    if (jsonLength <= contentCap) {
      const prefixCap = contentCap - jsonLength
      return `${raw.slice(0, Math.min(jsonRange.start, prefixCap))}${raw.slice(jsonRange.start, jsonRange.end)}${marker}`
    }
  }
  return `${raw.slice(0, contentCap).trimEnd()}${marker}`
}

export function normalizeErrorText(raw: string, options?: NormalizeErrorTextOptions): NormalizedErrorText {
  const requestedCap = options?.cap ?? DEFAULT_ERROR_TEXT_CAP
  const cap = Number.isFinite(requestedCap)
    ? Math.max(MIN_ERROR_TEXT_CAP, Math.floor(requestedCap))
    : DEFAULT_ERROR_TEXT_CAP
  const originalLength = raw.length
  const htmlSummary = htmlDocumentSummary(raw)

  if (htmlSummary) {
    return {
      display: clampWithMarker(htmlSummary, cap, originalLength),
      truncated: true,
      originalLength,
    }
  }
  if (originalLength <= cap) {
    return { display: raw, truncated: false, originalLength }
  }
  return {
    display: clampWithMarker(raw, cap, originalLength),
    truncated: true,
    originalLength,
  }
}
