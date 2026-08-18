export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: false;
    overrides: Array<{ method: "popup"; minutes: number }>;
  };
  extendedProperties: {
    private: {
      ebbinghausReview: "1";
      sourcePath: string;
    };
  };
}

export interface GoogleCalendarEventInput {
  vaultName: string;
  filePath: string;
  basename: string;
  nextDate: string;
  reviewTime: string;
  timeZone: string;
  reminderMinutes: number;
  stage: number;
  totalStages: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function googleCalendarEventId(
  vaultName: string,
  filePath: string,
): Promise<string> {
  return `ebbr${await sha256(`${vaultName}\0${filePath}`)}`;
}

function addMinutes(dateKey: string, time: string, minutes: number): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Google Calendar 일정 날짜 또는 시각이 올바르지 않습니다.");
  const date = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]) + minutes,
  );
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

export async function buildGoogleCalendarEvent(
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const start = `${input.nextDate}T${input.reviewTime}:00`;
  const end = addMinutes(input.nextDate, input.reviewTime, 15);
  const noteUri = `obsidian://open?vault=${encodeURIComponent(input.vaultName)}` +
    `&file=${encodeURIComponent(input.filePath)}`;

  return {
    id: await googleCalendarEventId(input.vaultName, input.filePath),
    summary: `복습 · ${input.basename}`,
    description: [
      `복습 단계 ${input.stage + 1}/${input.totalStages}`,
      "",
      "Obsidian에서 노트 열기",
      noteUri,
    ].join("\n"),
    start: { dateTime: start, timeZone: input.timeZone },
    end: { dateTime: end, timeZone: input.timeZone },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: input.reminderMinutes }],
    },
    extendedProperties: {
      private: {
        ebbinghausReview: "1",
        sourcePath: input.filePath,
      },
    },
  };
}
