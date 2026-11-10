/** @jsxImportSource react */
import { currentLocale } from "@/i18n"
import type { AutomationSchedule } from "@openwork/types/automations"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const

function tomorrowAtNine() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(9, 0, 0, 0)
  return date.getTime()
}

function toLocalDateTime(value: number) {
  const date = new Date(value)
  const component = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${component(date.getMonth() + 1)}-${component(date.getDate())}T${component(date.getHours())}:${component(date.getMinutes())}`
}

function timeForSchedule(schedule: AutomationSchedule) {
  if (schedule.kind === "once" || schedule.kind === "calendar") return { hour: 9, minute: 0 }
  if (schedule.kind === "interval") return { hour: schedule.startHour, minute: 0 }
  return { hour: schedule.hour, minute: schedule.minute }
}

const MEETING_MINUTES = [0, 5, 10, 15, 30, 60] as const
const meetingMinutesLabel = (minutes: number, edge: "start" | "end") => minutes === 0
  ? edge === "start" ? currentLocale() === "zh" ? "会议开始时" : "When it starts" : currentLocale() === "zh" ? "会议结束时" : "When it ends"
  : currentLocale() === "zh" ? `会议${edge === "start" ? "开始前" : "结束后"} ${minutes} 分钟` : `${minutes} min ${edge === "start" ? "before it starts" : "after it ends"}`

const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12] as const
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`

/** One schedule choice on the shared Select, labelled by the field's <Label htmlFor>. */
function ScheduleSelect<T extends string | number>(props: {
  id: string
  value: T
  items: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <Select
      value={props.value}
      items={props.items}
      onValueChange={(value) => {
        const match = props.items.find((item) => item.value === value)
        if (match) props.onChange(match.value)
      }}
    >
      <SelectTrigger id={props.id} className="w-full rounded-lg">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {props.items.map((item) => <SelectItem key={String(item.value)} value={item.value}>{item.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * Frequency, time, days and time zone of an Automation schedule. Shared by the
 * full Automation editor and the Calendar's "Edit schedule" dialog so both
 * edit schedules the same way.
 */
export function AutomationScheduleFields(props: {
  schedule: AutomationSchedule
  onChange: (schedule: AutomationSchedule) => void
  /** Prefix for element ids, so two editors can share a page. */
  idPrefix?: string
}) {
  const id = (name: string) => `${props.idPrefix ?? "automation"}-${name}`
  const schedule = props.schedule
  const time = timeForSchedule(schedule)
  // Every-few-hours and around-meetings schedules are generally available; always offered.
  const intervalOffered = true
  const meetingsOffered = true

  const changeScheduleKind = (kind: AutomationSchedule["kind"]) => {
    const timezone = schedule.timezone
    const days = schedule.kind === "weekly" || schedule.kind === "interval" ? schedule.daysOfWeek : [1, 2, 3, 4, 5]
    if (kind === "once") return props.onChange({ kind, timezone, at: tomorrowAtNine() })
    if (kind === "daily") return props.onChange({ kind, timezone, hour: time.hour, minute: time.minute })
    if (kind === "interval") return props.onChange({ kind, timezone, everyHours: 3, daysOfWeek: days, startHour: 9, endHour: 18 })
    if (kind === "calendar") return props.onChange({ kind, timezone, edge: "end", offsetMinutes: 5, rule: { withExternalAttendees: false } })
    props.onChange({ kind, timezone, daysOfWeek: days, hour: time.hour, minute: time.minute })
  }

  const changeTime = (value: string) => {
    const [hour, minute] = value.split(":").map(Number)
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || (schedule.kind !== "daily" && schedule.kind !== "weekly")) return
    props.onChange({ ...schedule, hour, minute })
  }

  const toggleWeekday = (day: number) => {
    if (schedule.kind !== "weekly" && schedule.kind !== "interval") return
    const selected = schedule.daysOfWeek.includes(day)
    const daysOfWeek = selected
      ? schedule.daysOfWeek.filter((value) => value !== day)
      : [...schedule.daysOfWeek, day].sort((left, right) => left - right)
    if (daysOfWeek.length === 0) return
    props.onChange({ ...schedule, daysOfWeek })
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={id("frequency")}>{currentLocale() === "zh" ? "计划" : "Schedule"}</Label>
          <ScheduleSelect
            id={id("frequency")}
            value={schedule.kind}
            items={[
              { value: "once", label: currentLocale() === "zh" ? "单次" : "Once" },
              { value: "daily", label: currentLocale() === "zh" ? "每天" : "Daily" },
              { value: "weekly", label: currentLocale() === "zh" ? "每周" : "Weekly" },
              ...(intervalOffered ? [{ value: "interval" as const, label: currentLocale() === "zh" ? "每隔几小时" : "Every few hours" }] : []),
              ...(meetingsOffered ? [{ value: "calendar" as const, label: currentLocale() === "zh" ? "会议前后" : "Around my meetings" }] : []),
            ]}
            onChange={changeScheduleKind}
          />
        </div>
        {schedule.kind === "calendar" ? (
          <div className="space-y-2">
            <Label htmlFor={id("meeting-moment")}>{currentLocale() === "zh" ? "运行时机" : "Runs"}</Label>
            <ScheduleSelect
              id={id("meeting-moment")}
              value={`${schedule.edge}:${Math.abs(schedule.offsetMinutes)}`}
              items={(["start", "end"] as const).flatMap((edge) => [...new Set([...MEETING_MINUTES, ...(schedule.edge === edge ? [Math.abs(schedule.offsetMinutes)] : [])])]
                .sort((left, right) => left - right)
                .map((minutes) => ({ value: `${edge}:${minutes}`, label: meetingMinutesLabel(minutes, edge) })))}
              onChange={(value) => {
                const [edge, minutes] = value.split(":")
                if (edge !== "start" && edge !== "end") return
                props.onChange({ ...schedule, edge, offsetMinutes: edge === "start" ? -Number(minutes) : Number(minutes) })
              }}
            />
          </div>
        ) : schedule.kind === "interval" ? (
          <div className="space-y-2">
            <Label htmlFor={id("every-hours")}>{currentLocale() === "zh" ? "间隔" : "Every"}</Label>
            <ScheduleSelect
              id={id("every-hours")}
              value={schedule.everyHours}
              items={[...new Set([...INTERVAL_HOURS, schedule.everyHours])].sort((left, right) => left - right)
                .map((hours) => ({ value: hours, label: currentLocale() === "zh" ? `${hours} 小时` : hours === 1 ? "1 hour" : `${hours} hours` }))}
              onChange={(everyHours) => props.onChange({ ...schedule, everyHours })}
            />
          </div>
        ) : schedule.kind === "once" ? (
          <div className="space-y-2">
            <Label htmlFor={id("once-at")}>{currentLocale() === "zh" ? "运行时间" : "Run at"}</Label>
            <Input
              id={id("once-at")}
              type="datetime-local"
              value={toLocalDateTime(schedule.at)}
              onChange={(event) => {
                const at = new Date(event.currentTarget.value).getTime()
                if (Number.isFinite(at)) props.onChange({ kind: "once", timezone: schedule.timezone, at })
              }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={id("time")}>{currentLocale() === "zh" ? "时间" : "Time"}</Label>
            <Input
              id={id("time")}
              type="time"
              value={`${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`}
              onChange={(event) => changeTime(event.currentTarget.value)}
            />
          </div>
        )}
      </div>

      {schedule.kind === "interval" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id("window-start")}>{currentLocale() === "zh" ? "开始" : "From"}</Label>
            <ScheduleSelect
              id={id("window-start")}
              value={schedule.startHour}
              items={Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: hourLabel(hour) }))}
              onChange={(startHour) => props.onChange({ ...schedule, startHour, endHour: Math.max(schedule.endHour, startHour + 1) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("window-end")}>{currentLocale() === "zh" ? "结束" : "Until"}</Label>
            <ScheduleSelect
              id={id("window-end")}
              value={schedule.endHour}
              items={Array.from({ length: 24 - schedule.startHour }, (_, index) => schedule.startHour + index + 1)
                .map((hour) => ({ value: hour, label: hour === 24 ? currentLocale() === "zh" ? "当天结束" : "End of day" : hourLabel(hour) }))}
              onChange={(endHour) => props.onChange({ ...schedule, endHour })}
            />
          </div>
        </div>
      ) : null}

      {schedule.kind === "calendar" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={id("meeting-external")}
              checked={schedule.rule.withExternalAttendees}
              onCheckedChange={(checked) => props.onChange({ ...schedule, rule: { ...schedule.rule, withExternalAttendees: checked } })}
            />
            <Label htmlFor={id("meeting-external")}>{currentLocale() === "zh" ? "仅限包含组织外部参会者的会议" : "Only meetings with people outside my organization"}</Label>
          </div>
          <p className="text-xs text-muted-foreground">{currentLocale() === "zh" ? "使用 Google 日历中已接受的会议，需要云端运行。" : "Uses meetings you accepted on your Google Calendar. Requires cloud execution."}</p>
        </div>
      ) : null}

      {schedule.kind === "weekly" || schedule.kind === "interval" ? (
        <div className="space-y-2">
          <Label>{currentLocale() === "zh" ? "日期" : "Days"}</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                type="button"
                size="sm"
                variant={schedule.daysOfWeek.includes(day.value) ? "secondary" : "outline"}
                onClick={() => toggleWeekday(day.value)}
              >
                {currentLocale() === "zh" ? ["周日","周一","周二","周三","周四","周五","周六"][day.value] : day.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

/** The time zone input, kept separate so the full editor can pair it with the model picker. */
export function AutomationTimezoneField(props: {
  timezone: string
  onChange: (timezone: string) => void
  idPrefix?: string
}) {
  const id = `${props.idPrefix ?? "automation"}-timezone`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{currentLocale() === "zh" ? "时区" : "Timezone"}</Label>
      <Input id={id} value={props.timezone} onChange={(event) => props.onChange(event.currentTarget.value)} />
    </div>
  )
}
