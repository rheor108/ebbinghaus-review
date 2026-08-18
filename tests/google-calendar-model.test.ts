import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleCalendarEvent,
  googleCalendarEventId,
} from "../src/google-calendar-model";

test("builds a deterministic Google Calendar event", async () => {
  const input = {
    vaultName: "Study Vault",
    filePath: "학습/테스트.md",
    basename: "테스트",
    nextDate: "2026-08-19",
    reviewTime: "09:00",
    timeZone: "Asia/Seoul",
    reminderMinutes: 10,
    stage: 1,
    totalStages: 7,
  };
  const first = await buildGoogleCalendarEvent(input);
  const second = await buildGoogleCalendarEvent(input);

  assert.equal(first.id, second.id);
  assert.match(first.id, /^[0-9a-v]{5,1024}$/);
  assert.equal(first.summary, "복습 · 테스트");
  assert.equal(first.start.dateTime, "2026-08-19T09:00:00");
  assert.equal(first.end.dateTime, "2026-08-19T09:15:00");
  assert.match(first.description, /obsidian:\/\/open\?vault=Study%20Vault/);
  assert.equal(first.reminders.overrides[0]?.minutes, 10);
});

test("uses the vault and note path as the stable event identity", async () => {
  assert.notEqual(
    await googleCalendarEventId("Vault", "a.md"),
    await googleCalendarEventId("Vault", "b.md"),
  );
});

test("rolls an event end time into the next day", async () => {
  const event = await buildGoogleCalendarEvent({
    vaultName: "Vault",
    filePath: "a.md",
    basename: "a",
    nextDate: "2026-12-31",
    reviewTime: "23:55",
    timeZone: "Asia/Seoul",
    reminderMinutes: 0,
    stage: 0,
    totalStages: 7,
  });
  assert.equal(event.end.dateTime, "2027-01-01T00:10:00");
});
