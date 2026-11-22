import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { zhCN, enUS } from "react-day-picker/locale";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentLocale, t } from "@/i18n";

const pad = (value: number) => String(value).padStart(2, "0");
export function localDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function DateTimePicker({ value, onChange, disabled, id }: { value: string; onChange: (value: string) => void; disabled?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : null;
  const selected = date && Number.isFinite(date.getTime()) ? date : undefined;
  const hour = selected ? pad(selected.getHours()) : "09";
  const minute = selected ? pad(selected.getMinutes()) : "00";
  function timeChange(nextHour: string, nextMinute: string) {
    const next = new Date(selected ?? Date.now()); next.setHours(Number(nextHour), Number(nextMinute), 0, 0); onChange(localDateTime(next));
  }
  return <div className="space-y-3" data-followup-date-time>
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button id={id} type="button" variant="outline" disabled={disabled} className="w-full justify-start" aria-label={t("workspace.timers.date")} />}><CalendarClock className="size-4" />{selected ? selected.toLocaleDateString() : t("workspace.timers.choose_date")}</PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <DayPicker mode="single" selected={selected} defaultMonth={selected} locale={currentLocale() === "zh" ? zhCN : enUS} disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }} onSelect={day => { if (!day) return; day.setHours(Number(hour), Number(minute), 0, 0); onChange(localDateTime(day)); setOpen(false); }}
          labels={{ labelPrevious: () => t("workspace.timers.previous_month"), labelNext: () => t("workspace.timers.next_month"), labelDayButton: (day, modifiers) => [day.toLocaleDateString(currentLocale() === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" }), ...(modifiers.today ? [t("workspace.timers.today")] : []), ...(modifiers.selected ? [t("workspace.timers.selected")] : [])].join(", ") }}
          classNames={{ root: "text-sm", months: "relative", month_caption: "flex h-10 items-center font-medium", nav: "absolute right-0 top-0 flex gap-1", button_previous: "inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", button_next: "inline-flex size-9 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", chevron: "size-4 fill-current", weekday: "size-9 text-xs font-normal text-muted-foreground", day: "size-9 p-0 text-center", day_button: "size-9 rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", selected: "rounded-md bg-primary text-primary-foreground", today: "font-semibold underline underline-offset-4", disabled: "opacity-30", outside: "text-muted-foreground" }} />
      </PopoverContent></Popover>
    <TimePicker value={`${hour}:${minute}`} disabled={disabled} onChange={value => { const [h, m] = value.split(":"); timeChange(h!, m!); }} />
    <p className="text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
  </div>;
}

export function TimePicker({ value, onChange, disabled, id, hourOnly = false, minHour = 0, maxHour = 23, endOfDayLabel }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  hourOnly?: boolean;
  minHour?: number;
  maxHour?: number;
  endOfDayLabel?: string;
}) {
  const [hour = "09", minute = "00"] = value.split(":");
  return (
    <div role="group" aria-label={t("workspace.timers.daily_time")} className="flex items-center gap-2" data-time-picker>
      <Select value={hour} disabled={disabled} onValueChange={value => { if (value) onChange(`${value}:${minute}`); }}><SelectTrigger id={id} className="flex-1" aria-label={t("workspace.timers.hour")}><SelectValue>{hour === "24" && endOfDayLabel ? endOfDayLabel : hourOnly ? `${hour}:00` : hour}</SelectValue></SelectTrigger><SelectContent>{Array.from({length: maxHour - minHour + 1}, (_,i) => i + minHour).map(hour => <SelectItem key={hour} value={pad(hour)}>{hour === 24 && endOfDayLabel ? endOfDayLabel : hourOnly ? `${pad(hour)}:00` : pad(hour)}</SelectItem>)}</SelectContent></Select>
      {!hourOnly ? <><span aria-hidden="true">:</span>
      <Select value={minute} disabled={disabled} onValueChange={value => { if (value) onChange(`${hour}:${value}`); }}><SelectTrigger className="flex-1" aria-label={t("workspace.timers.minute")}><SelectValue /></SelectTrigger><SelectContent>{Array.from({length:60}, (_,i) => <SelectItem key={i} value={pad(i)}>{pad(i)}</SelectItem>)}</SelectContent></Select></> : null}
    </div>
  );
}
