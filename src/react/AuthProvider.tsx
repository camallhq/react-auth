// src/react/AuthProvider.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthConfig, AuthState, TokenSet } from "../types";
import { AuthContext } from "./AuthContext";
import { resolveStorage, Keys, loadTokens, saveTokens, clearAuth } from "../auth/storage";
import { buildAuthorizeUrl, exchangeCodeForTokens, fetchUserInfo } from "../auth/oidc";
import { refreshTokens } from "../auth/oidc";
import { tryAcquireLock, releaseLock, waitForUnlock } from "../auth/refreshLock";

function isExpired(tokens: TokenSet, skewSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return tokens.expiresAt - skewSeconds <= now;
}

export function AuthProvider(props: { config: AuthConfig; children: React.ReactNode }) {
  const cfg = props.config;
  const storage = useMemo(() => resolveStorage(cfg.storage ?? "session"), [cfg.storage]);

  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
  });

  const finalizeFromCallback = useCallback(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    // Not a callback
    if (!code || !returnedState) return false;

    const expectedState = storage.getItem(Keys.state);
    const verifier = storage.getItem(Keys.pkceVerifier);

    if (!expectedState || expectedState !== returnedState || !verifier) {
      throw new Error("Invalid auth callback (state/verifier mismatch)");
    }

    const tokens = await exchangeCodeForTokens(cfg, code, verifier);
    saveTokens(storage, tokens);

    const user = await fetchUserInfo(cfg, tokens.accessToken);
    storage.setItem(Keys.user, JSON.stringify(user));

    // Clean query params
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, document.title, url.toString());

    setState({ isLoading: false, isAuthenticated: true, tokens, user });
    return true;
  }, [cfg, storage]);

  const boot = useCallback(async () => {
    try {
      // If this is a callback, complete it first
      const handled = await finalizeFromCallback();
      if (handled) return;

      const tokens = loadTokens(storage);
      if (!tokens) {
        setState({ isLoading: false, isAuthenticated: false });
        return;
      }
      if (tokens && cfg.useRefreshToken && tokens.refreshToken && shouldRefresh(tokens)) {
        const next = await refreshIfNeeded();
        if (!next) { setState({ isLoading: false, isAuthenticated: false }); return; }
        setState((s) => ({ ...s, isLoading: false, isAuthenticated: true, tokens: next }));
        return;
      }

      // NOTE: refresh token flow omitted here for brevity; see below notes.
      if (isExpired(tokens, cfg.clockSkewSeconds ?? 60)) {
        clearAuth(storage);
        setState({ isLoading: false, isAuthenticated: false });
        return;
      }

      const rawUser = storage.getItem(Keys.user);
      const user = rawUser ? (JSON.parse(rawUser) as Record<string, any>) : undefined;

      setState({ isLoading: false, isAuthenticated: true, tokens, user });
    } catch (e: any) {
      clearAuth(storage);
      setState({ isLoading: false, isAuthenticated: false, error: e?.message ?? "Auth error" });
    }
  }, [cfg.clockSkewSeconds, finalizeFromCallback, storage]);

  useEffect(() => { void boot(); }, [boot]);

  const login = useCallback(async (opts?: { redirectTo?: string }) => {
    const appRedirect = opts?.redirectTo ?? cfg.defaultAppRedirect ?? window.location.pathname;

    const built = await buildAuthorizeUrl(cfg, { appState: appRedirect });
    storage.setItem(Keys.pkceVerifier, built.verifier);
    storage.setItem(Keys.state, built.state);
    storage.setItem(Keys.nonce, built.nonce);

    window.location.assign(built.url);
  }, [cfg, storage]);

  const logout = useCallback(async () => {
    clearAuth(storage);
    setState({ isLoading: false, isAuthenticated: false });

    // Optional end-session redirect
    if (cfg.endSessionEndpoint) {
      const url = new URL(cfg.endSessionEndpoint);
      if (cfg.postLogoutRedirectUri) url.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
      window.location.assign(url.toString());
    } else if (cfg.postLogoutRedirectUri) {
      window.location.assign(cfg.postLogoutRedirectUri);
    }
  }, [cfg.endSessionEndpoint, cfg.postLogoutRedirectUri, storage]);

  const shouldRefresh = (tokens: TokenSet) => {
  const now = Math.floor(Date.now() / 1000);
  const leeway = cfg.refreshLeewaySeconds ?? 90;
  return tokens.expiresAt - leeway <= now;
};

const refreshIfNeeded = useCallback(async () => {
  const tokens = loadTokens(storage);
  if (!tokens) return undefined;

  if (!cfg.useRefreshToken) return tokens;
  if (!tokens.refreshToken) return tokens;

  if (!shouldRefresh(tokens)) return tokens;

  // cross-tab lock
  const lockKey = cfg.refreshLockKey ?? "ra_refresh_lock";
  const ttl = cfg.refreshLockTtlMs ?? 15000;

  if (!tryAcquireLock(storage, lockKey, ttl)) {
    // someone else is refreshing — wait and then re-load
    await waitForUnlock(storage, lockKey, 6000);
    return loadTokens(storage);
  }

  try {
    const next = await refreshTokens(cfg, tokens.refreshToken);
    saveTokens(storage, next);
    setState((s) => ({ ...s, isAuthenticated: true, tokens: next }));

    // refresh userinfo optionally (you can keep as-is if not needed)
    // const user = await fetchUserInfo(cfg, next.accessToken);
    // storage.setItem(Keys.user, JSON.stringify(user));
    // setState((s) => ({ ...s, user }));

    return next;
  } finally {
    releaseLock(storage, lockKey);
  }
}, [cfg, storage]);

const getAccessToken = useCallback(async () => {
  const tokens = await refreshIfNeeded();
  return tokens?.accessToken;
}, [refreshIfNeeded]);

  const value = useMemo(() => ({
    ...state,
    config: cfg,
    login,
    logout,
    getAccessToken,
  }), [cfg, login, logout, state, getAccessToken]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}
