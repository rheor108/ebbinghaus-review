import { Platform, requestUrl } from "obsidian";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface LoopbackResult {
  code: string;
  redirectUri: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomValue(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function openSystemBrowser(url: string): Promise<void> {
  const { shell } = require("electron") as {
    shell: { openExternal(target: string): Promise<void> };
  };
  return shell.openExternal(url);
}

async function waitForLoopbackCode(
  clientId: string,
  verifier: string,
  state: string,
): Promise<LoopbackResult> {
  const { createServer } = require("http") as typeof import("node:http");
  let settled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<LoopbackResult>((resolve, reject) => {
    const finish = (error: Error | null, result?: LoopbackResult): void => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      server.close();
      if (error) reject(error);
      else resolve(result!);
    };

    const server = createServer((request, response) => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}`;
      const url = new URL(request.url ?? "/", redirectUri);
      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error");

      response.statusCode = code && returnedState === state ? 200 : 400;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(response.statusCode === 200
        ? "<!doctype html><meta charset=utf-8><title>연결 완료</title>" +
          "<h1>Google Calendar 연결 완료</h1><p>이 창을 닫고 Obsidian으로 돌아가세요.</p>"
        : "<!doctype html><meta charset=utf-8><title>연결 실패</title>" +
          "<h1>Google Calendar 연결 실패</h1><p>Obsidian으로 돌아가 다시 시도하세요.</p>");

      if (oauthError) return finish(new Error(`Google 로그인이 취소되었습니다: ${oauthError}`));
      if (returnedState !== state) return finish(new Error("Google OAuth 상태 검증에 실패했습니다."));
      if (!code) return finish(new Error("Google에서 인증 코드를 받지 못했습니다."));
      finish(null, { code, redirectUri });
    });

    server.once("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      if (!port) return finish(new Error("Google 로그인용 로컬 콜백을 열지 못했습니다."));
      const redirectUri = `http://127.0.0.1:${port}`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_CALENDAR_SCOPE,
        access_type: "offline",
        prompt: "consent",
        code_challenge: await codeChallenge(verifier),
        code_challenge_method: "S256",
        state,
      });
      try {
        await openSystemBrowser(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    timeoutId = setTimeout(() => {
      finish(new Error("Google 로그인 시간이 초과되었습니다. 다시 시도하세요."));
    }, 5 * 60 * 1000);
  });
}

export async function authorizeGoogleCalendarDesktop(
  clientId: string,
): Promise<GoogleOAuthTokens> {
  if (!Platform.isDesktopApp) {
    throw new Error("Google Calendar 계정 연결은 데스크톱에서만 지원합니다.");
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    throw new Error("Google OAuth 데스크톱 클라이언트 ID를 확인하세요.");
  }

  const verifier = randomValue(64);
  const state = randomValue(32);
  const { code, redirectUri } = await waitForLoopbackCode(clientId, verifier, state);
  const response = await requestUrl({
    url: "https://oauth2.googleapis.com/token",
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }).toString(),
    throw: false,
  });
  const payload = response.json as Record<string, unknown>;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Google 토큰 발급에 실패했습니다: ${String(payload.error_description ?? payload.error ?? response.status)}`);
  }
  if (typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") {
    throw new Error("Google에서 장기 인증 토큰을 받지 못했습니다.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
  };
}
