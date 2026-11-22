import { expect, test } from "bun:test";
import { dailyWallTime, calendarRecurrenceSchema, latestCalendarOccurrence, nextCalendarOccurrence } from "../src/always-on-calendar";

test("daily delivery follows DST rather than a 1440 minute interval", () => {
  const first = dailyWallTime("2026-03-07","09:00","America/Los_Angeles")!;
  const second = dailyWallTime("2026-03-08","09:00","America/Los_Angeles")!;
  expect(second-first).toBe(23*3600000);
  expect(dailyWallTime("2026-03-08","02:30","America/Los_Angeles")).toBeNull();
  expect(dailyWallTime("2026-11-01","01:30","America/Los_Angeles")).toBe(Date.parse("2026-11-01T08:30:00Z"));
});
test("generic recurrence rejects invalid time zones and wall times", () => {
 for(const value of [{kind:"daily",at:"09:00",timeZone:"invalid"},{kind:"daily",at:"24:00",timeZone:"Asia/Shanghai"}])expect(calendarRecurrenceSchema.safeParse(value).success).toBe(false);
});
test("generic daily recurrence coalesces downtime and advances over DST", () => {
  const schedule = calendarRecurrenceSchema.parse({kind:"daily",at:"09:00",timeZone:"America/Los_Angeles"});
  const before = Date.parse("2026-03-07T17:00:00Z");
  expect(nextCalendarOccurrence(schedule,before)).toBe(Date.parse("2026-03-08T16:00:00Z"));
  expect(latestCalendarOccurrence(schedule,Date.parse("2026-03-12T19:00:00Z"))).toBe(Date.parse("2026-03-12T16:00:00Z"));
  expect(latestCalendarOccurrence(schedule,Date.parse("2026-03-12T15:00:00Z"))).toBe(Date.parse("2026-03-11T16:00:00Z"));
});
test("generic daily recurrence skips missing wall times without duplicating repeated ones", () => {
  const schedule=calendarRecurrenceSchema.parse({kind:"daily",at:"02:30",timeZone:"America/Los_Angeles"});
  expect(nextCalendarOccurrence(schedule,Date.parse("2026-03-07T10:30:00Z"))).toBe(Date.parse("2026-03-09T09:30:00Z"));
  expect(latestCalendarOccurrence(schedule,Date.parse("2026-03-08T12:00:00Z"))).toBe(Date.parse("2026-03-07T10:30:00Z"));
  const repeated={...schedule,at:"01:30"};
  expect(nextCalendarOccurrence(repeated,Date.parse("2026-11-01T08:30:00Z"))).toBe(Date.parse("2026-11-02T09:30:00Z"));
});
