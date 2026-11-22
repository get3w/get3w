import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const calendarRecurrenceSchema = z.object({
  kind: z.literal("daily"),
  at: time,
  timeZone: z.string().refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
    catch { return false; }
  }, "Choose a valid time zone"),
}).strict();
export type CalendarRecurrence = z.infer<typeof calendarRecurrenceSchema>;

export { dailyWallTime, latestCalendarOccurrence, nextCalendarOccurrence } from "@get3w/types/workspace-calendar";
