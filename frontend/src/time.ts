/** IANA wall-time conversion. No 24-hour assumption at a local day boundary. */
type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }
export type LocalCandidate = { instant: string; offset: string }

const formatters = new Map<string, Intl.DateTimeFormat>()
const offsets = new Map<string, number[]>()
const boundaries = new Map<string, string>()

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatters.get(timezone)
  if (!value) {
    value = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    formatters.set(timezone, value)
  }
  return value
}

function parts(instantMs: number, timezone: string): Parts {
  return Object.fromEntries(formatter(timezone).formatToParts(new Date(instantMs))
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])) as Parts
}

function wallMs(value: Parts): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second)
}

function parseWall(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error('请选择有效的日期与时间。')
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0)
  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  const date = new Date(ms)
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error('请选择有效的日期与时间。')
  }
  return ms
}

function offsetLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  const absolute = Math.abs(minutes)
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`
}

export function localCandidates(value: string, timezone: string): LocalCandidate[] {
  const assumed = parseWall(value)
  const key = `${timezone}|${value.slice(0, 10)}`
  if (!offsets.has(key)) {
    const found = new Set<number>()
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = assumed + hours * 3_600_000
      found.add(wallMs(parts(sample, timezone)) - sample)
    }
    offsets.set(key, [...found])
  }
  return offsets.get(key)!.map(offset => ({ ms: assumed - offset, offset }))
    .filter(candidate => wallMs(parts(candidate.ms, timezone)) === assumed)
    .sort((a, b) => a.ms - b.ms)
    .map(candidate => ({ instant: new Date(candidate.ms).toISOString(), offset: offsetLabel(candidate.offset) }))
}

export function fromLocal(value: string, timezone: string, chosenOffset = ''): string {
  const candidates = localCandidates(value, timezone)
  if (!candidates.length) throw new Error('这个当地时刻因夏令时跳跃而不存在，请重新选择。')
  if (candidates.length === 1) return candidates[0]!.instant
  const chosen = candidates.find(candidate => candidate.offset === chosenOffset)
  if (chosen) return chosen.instant
  throw new Error('这个当地时刻重复出现，请明确选择 UTC 偏移。')
}

export function toLocal(instant: string, timezone: string): string {
  const value = parts(Date.parse(instant), timezone)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}`
}

export function offsetAt(instant: string, timezone: string): string {
  const ms = Date.parse(instant)
  return offsetLabel(wallMs(parts(ms, timezone)) - Math.floor(ms / 1000) * 1000)
}

export function dayAt(instant: string | Date, timezone: string): string {
  const value = parts(instant instanceof Date ? instant.getTime() : Date.parse(instant), timezone)
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function today(timezone: string): string { return dayAt(new Date(), timezone) }

export function addDays(day: string, amount: number): string {
  parseWall(`${day}T00:00`)
  const value = new Date(`${day}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}

export function daysBetween(fromDay: string, toDayExclusive: string): number {
  parseWall(`${fromDay}T00:00`)
  parseWall(`${toDayExclusive}T00:00`)
  return (Date.parse(`${toDayExclusive}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / 86_400_000
}

export function startOfDay(day: string, timezone: string): string {
  parseWall(`${day}T00:00`)
  const key = `${timezone}|${day}`
  const cached = boundaries.get(key)
  if (cached) return cached
  const wallAt = (minute: number) => `${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
  for (let minute = 0; minute < 1440; minute += 30) {
    if (!localCandidates(wallAt(minute), timezone).length) continue
    for (let first = Math.max(0, minute - 29); first <= minute; first++) {
      const candidates = localCandidates(wallAt(first), timezone)
      if (candidates.length) {
        boundaries.set(key, candidates[0]!.instant)
        return candidates[0]!.instant
      }
    }
  }
  throw new Error('所选日期在这个时区整日不存在，请改选日期。')
}

export function calendarBounds(fromDay: string, toDayExclusive: string, timezone: string) {
  const days = daysBetween(fromDay, toDayExclusive)
  if (!Number.isInteger(days) || days < 1 || days > 93) throw new Error('日期范围应为 1 到 93 天。')
  return { from: startOfDay(fromDay, timezone), to: startOfDay(toDayExclusive, timezone),
    timezone, days }
}

export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}
