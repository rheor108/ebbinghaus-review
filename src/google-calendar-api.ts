import { requestUrl } from "obsidian";
import type { GoogleCalendarEvent } from "./google-calendar-model";

interface GoogleAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleCalendarResource {
  id?: string;
}

interface GoogleEventsList {
  items?: Array<{ id?: string }>;
  nextPageToken?: string;
}

export interface GoogleCalendarSyncResult {
  created: number;
  updated: number;
  deleted: number;
}

export class GoogleCalendarApi {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly refreshToken: string,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    const response = await requestUrl({
      url: "https://oauth2.googleapis.com/token",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        client_id: this.clientId,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      throw: false,
    });
    const payload = response.json as GoogleAccessTokenResponse;
    if (response.status < 200 || response.status >= 300 || !payload.access_token) {
      throw new Error(`Google 인증을 갱신하지 못했습니다: ${payload.error_description ?? payload.error ?? response.status}`);
    }
    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private async api<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const token = await this.getAccessToken();
    const response = await requestUrl({
      url: `https://www.googleapis.com/calendar/v3${path}`,
      method,
      contentType: body === undefined ? undefined : "application/json",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}` },
      throw: false,
    });
    const data = response.text ? response.json as T : {} as T;
    if (response.status < 200 || response.status >= 300) {
      const error = data as Record<string, unknown>;
      const nested = error.error as Record<string, unknown> | undefined;
      throw Object.assign(
        new Error(`Google Calendar API 오류: ${String(nested?.message ?? response.status)}`),
        { status: response.status },
      );
    }
    return { status: response.status, data };
  }

  async ensureCalendar(
    calendarId: string,
    calendarName: string,
    timeZone: string,
  ): Promise<string> {
    if (calendarId) {
      try {
        await this.api(`/calendars/${encodeURIComponent(calendarId)}`);
        return calendarId;
      } catch (error) {
        if (!(error instanceof Error) || (error as Error & { status?: number }).status !== 404) {
          throw error;
        }
      }
    }

    const { data } = await this.api<GoogleCalendarResource>("/calendars", "POST", {
      summary: calendarName,
      timeZone,
    });
    if (!data.id) throw new Error("Google 복습 캘린더를 생성하지 못했습니다.");
    return data.id;
  }

  private async listManagedEventIds(calendarId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    let pageToken = "";
    do {
      const query = new URLSearchParams({
        maxResults: "2500",
        showDeleted: "false",
        privateExtendedProperty: "ebbinghausReview=1",
      });
      if (pageToken) query.set("pageToken", pageToken);
      const { data } = await this.api<GoogleEventsList>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      );
      for (const item of data.items ?? []) {
        if (item.id) ids.add(item.id);
      }
      pageToken = data.nextPageToken ?? "";
    } while (pageToken);
    return ids;
  }

  async syncEvents(
    calendarId: string,
    desiredEvents: GoogleCalendarEvent[],
  ): Promise<GoogleCalendarSyncResult> {
    const existingIds = await this.listManagedEventIds(calendarId);
    const desiredIds = new Set(desiredEvents.map((event) => event.id));
    const result: GoogleCalendarSyncResult = { created: 0, updated: 0, deleted: 0 };

    for (const event of desiredEvents) {
      const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`;
      if (existingIds.has(event.id)) {
        await this.api(path, "PUT", event);
        result.updated += 1;
      } else {
        try {
          await this.api(`/calendars/${encodeURIComponent(calendarId)}/events`, "POST", event);
          result.created += 1;
        } catch (error) {
          if (!(error instanceof Error) || (error as Error & { status?: number }).status !== 409) {
            throw error;
          }
          await this.api(path, "PUT", event);
          result.updated += 1;
        }
      }
    }

    for (const eventId of existingIds) {
      if (desiredIds.has(eventId)) continue;
      await this.api(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        "DELETE",
      );
      result.deleted += 1;
    }
    return result;
  }

  async revoke(): Promise<void> {
    await requestUrl({
      url: `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(this.refreshToken)}`,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      throw: false,
    });
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }
}
