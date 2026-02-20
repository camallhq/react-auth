// src/auth/oidc.ts
import type { AuthConfig, TokenSet } from "../types";
import { randomString, sha256Base64Url } from "./pkce";

export function endpoints(cfg: AuthConfig) {
  const base = cfg.issuer.replace(/\/+$/, "");
  return {
    authorize: cfg.authorizeEndpoint ?? `${base}/oidc/authorize`,
    token: cfg.tokenEndpoint ?? `${base}/oidc/token`,
    userInfo: cfg.userInfoEndpoint ?? `${base}/oidc/userinfo`,
    endSession: cfg.endSessionEndpoint,
  };
}

export async function buildAuthorizeUrl(cfg: AuthConfig, opts?: { appState?: string }) {
  const { authorize } = endpoints(cfg);

  const verifier = randomString(32);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);
  const nonce = randomString(16);

  const scopes = (cfg.scopes?.length ? cfg.scopes : ["openid", "profile", "email"]).join(" ");

  const url = new URL(authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", scopes);

  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  if (cfg.audience) url.searchParams.set("audience", cfg.audience);
  if (opts?.appState) url.searchParams.set("app_state", opts.appState);

  if (cfg.extraAuthorizeParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthorizeParams)) url.searchParams.set(k, v);
  }

  return { url: url.toString(), verifier, state, nonce };
}

export async function exchangeCodeForTokens(cfg: AuthConfig, code: string, verifier: string): Promise<TokenSet> {
  const { token } = endpoints(cfg);

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", cfg.clientId);
  body.set("redirect_uri", cfg.redirectUri);
  body.set("code", code);
  body.set("code_verifier", verifier);

  const res = await fetch(token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const json = await res.json() as any;

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(json.expires_in ?? 3600);

  return {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    tokenType: json.token_type,
    scope: json.scope,
    expiresAt: now + expiresIn,
  };
}

export async function fetchUserInfo(cfg: AuthConfig, accessToken: string) {
  const { userInfo } = endpoints(cfg);
  const res = await fetch(userInfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`UserInfo failed (${res.status})`);
  return (await res.json()) as Record<string, any>;
}

export async function refreshTokens(cfg: AuthConfig, refreshToken: string): Promise<TokenSet> {
  const { token } = endpoints(cfg);

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", cfg.clientId);
  body.set("refresh_token", refreshToken);

  const res = await fetch(token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
  const json = (await res.json()) as any;

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(json.expires_in ?? 3600);

  // Rotation: some IDPs return a new refresh_token, some don't.
  return {
    accessToken: json.access_token,
    idToken: json.id_token,
    refreshToken: json.refresh_token ?? refreshToken,
    tokenType: json.token_type,
    scope: json.scope,
    expiresAt: now + expiresIn,
  };
}