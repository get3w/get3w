export interface AlwaysOnCalendarRecurrence { kind: "daily"; at: string; timeZone: string }

function parts(at: number, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const value = (name: string) => formatted.find(part => part.type === name)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

/** Resolve a wall clock time. DST gaps are skipped; repeated times use the first occurrence. */
export function dailyWallTime(date: string, time: string, timeZone: string): number | null {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall)) throw Error("Invalid calendar date");
  const candidates = new Set<number>();
  // Sampling either side of the target discovers both offsets at a DST boundary.
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000;
    const local = parts(sample, timeZone);
    const offset = Date.parse(`${local.date}T${local.time}:00Z`) - sample;
    const candidate = wall - offset;
    const check = parts(candidate, timeZone);
    if (check.date === date && check.time === time) candidates.add(candidate);
  }
  return candidates.size ? Math.min(...candidates) : null;
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** The latest occurrence at/before now, never a historical backlog. */
export function latestCalendarOccurrence(schedule: AlwaysOnCalendarRecurrence, now: number) {
  const date = parts(now, schedule.timeZone).date;
  for (let days = 0; days < 8; days++) {
    const candidate = dailyWallTime(shiftDate(date, -days), schedule.at, schedule.timeZone);
    if (candidate !== null && candidate <= now) return candidate;
  }
  throw Error("Calendar occurrence unavailable");
}

/** Strictly after the reference, preserving the configured wall time over DST. */
export function nextCalendarOccurrence(schedule: AlwaysOnCalendarRecurrence, after: number) {
  const date = parts(after, schedule.timeZone).date;
  for (let days = 0; days < 8; days++) {
    const candidate = dailyWallTime(shiftDate(date, days), schedule.at, schedule.timeZone);
    if (candidate !== null && candidate > after) return candidate;
  }
  throw Error("Calendar occurrence unavailable");
}
