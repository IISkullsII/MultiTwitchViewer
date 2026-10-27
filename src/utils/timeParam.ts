export function parseTimeParam(raw: string | null): number | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function formatTimeParam(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  let out = ''
  if (h) out += `${h}h`
  if (m || (h && s)) out += `${m}m`
  if (s || (!h && !m)) out += `${s}s`
  return out
}
