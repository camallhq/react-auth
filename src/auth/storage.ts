// src/auth/storage.ts
import type { AuthStorage, TokenSet } from "../types";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function resolveStorage(kind: AuthStorage): StorageLike {
  if (kind === "local") return window.localStorage;
  if (kind === "session") return window.sessionStorage;

  // memory fallback
  const mem: Record<string, string> = {};
  return {
    getItem: (k) => (k in mem ? mem[k] ?? null : null),
    setItem: (k, v) => void (mem[k] = v),
    removeItem: (k) => void delete mem[k],
  };
}

export const Keys = {
  pkceVerifier: "ra_pkce_verifier",
  state: "ra_state",
  nonce: "ra_nonce",
  tokens: "ra_tokens",
  user: "ra_user",
};

export function saveTokens(s: StorageLike, tokens: TokenSet) {
  s.setItem(Keys.tokens, JSON.stringify(tokens));
}
export function loadTokens(s: StorageLike): TokenSet | undefined {
  const raw = s.getItem(Keys.tokens);
  if (!raw) return undefined;
  try { return JSON.parse(raw) as TokenSet; } catch { return undefined; }
}
export function clearAuth(s: StorageLike) {
  s.removeItem(Keys.tokens);
  s.removeItem(Keys.user);
  s.removeItem(Keys.pkceVerifier);
  s.removeItem(Keys.state);
  s.removeItem(Keys.nonce);
}
