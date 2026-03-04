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

function shouldRefreshTokens(tokens: TokenSet, leewaySeconds: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return tokens.expiresAt - leewaySeconds <= now;
}

export function AuthProvider(props: { config: AuthConfig; children: React.ReactNode }) {
  const cfg = props.config;
  const storage = useMemo(() => resolveStorage(cfg.storage ?? "session"), [cfg.storage]);

  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
  });

  // ---------- refresh helpers ----------

  const refreshIfNeeded = useCallback(async (): Promise<TokenSet | undefined> => {
    const tokens = loadTokens(storage);
    if (!tokens) return undefined;

    // Treat missing useRefreshToken as enabled (opt-out with false).
    if (cfg.useRefreshToken === false) return tokens;
    if (!tokens.refreshToken) return tokens;

    const leeway = cfg.refreshLeewaySeconds ?? 90;
    if (!shouldRefreshTokens(tokens, leeway)) return tokens;

    // Cross-tab lock so only one tab refreshes at a time.
    const lockKey = cfg.refreshLockKey ?? "ra_refresh_lock";
    const ttl = cfg.refreshLockTtlMs ?? 15000;

    if (!tryAcquireLock(storage, lockKey, ttl)) {
      // Another tab is already refreshing — wait then re-load whatever it stored.
      await waitForUnlock(storage, lockKey, 6000);
      return loadTokens(storage);
    }

    try {
      const next = await refreshTokens(cfg, tokens.refreshToken);
      saveTokens(storage, next);
      setState((s) => ({ ...s, isAuthenticated: true, tokens: next }));
      return next;
    } catch {
      return undefined;
    } finally {
      releaseLock(storage, lockKey);
    }
  }, [cfg, storage]);

  // ---------- callback handler ----------

  const finalizeFromCallback = useCallback(async (): Promise<boolean> => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");

    // Not a callback URL — nothing to do.
    if (!code || !returnedState) return false;

    const expectedState = storage.getItem(Keys.state);
    const verifier = storage.getItem(Keys.pkceVerifier);

    if (!expectedState || expectedState !== returnedState || !verifier) {
      throw new Error("Invalid auth callback (state/verifier mismatch)");
    }

    // ── FIX (Problem 2) ─────────────────────────────────────────────────────
    // Immediately scrub ?code=&state= from the address bar BEFORE doing any
    // async work.  This prevents a second boot() call (React Strict Mode
    // double-fires effects) from seeing the same one-time code and trying to
    // exchange it a second time, which would fail and leave the callback page
    // visible.  Similarly, consume the stored nonces right away so a second
    // run of this function is a no-op.
    // ────────────────────────────────────────────────────────────────────────
    window.history.replaceState({}, document.title, window.location.pathname);
    storage.removeItem(Keys.state);
    storage.removeItem(Keys.pkceVerifier);
    storage.removeItem(Keys.nonce);

    const tokens = await exchangeCodeForTokens(cfg, code, verifier);
    saveTokens(storage, tokens);

    const user = await fetchUserInfo(cfg, tokens.accessToken);
    storage.setItem(Keys.user, JSON.stringify(user));

    // Resolve the original pre-login path, falling back to "/".
    const appRedirect = storage.getItem(Keys.appRedirect) ?? "/";
    storage.removeItem(Keys.appRedirect);

    setState({ isLoading: false, isAuthenticated: true, tokens, user });

    if ((cfg.postLoginNavigation ?? "replace") === "replace") {
      // Full navigation so the callback route component is completely replaced.
      // Tokens are already in storage, so the new page's boot() will find them.
      window.location.replace(appRedirect);
    } else {
      // Soft URL update — the hosting app's router will handle the transition.
      window.history.replaceState({}, document.title, appRedirect);
      // Dispatch popstate so React Router / other history listeners pick up the
      // URL change made by replaceState (replaceState does not fire popstate).
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }

    return true;
  }, [cfg, storage]);

  // ---------- boot ----------

  const boot = useCallback(async () => {
    try {
      // Handle OAuth callback first.
      const handled = await finalizeFromCallback();
      if (handled) return;

      const tokens = loadTokens(storage);

      if (!tokens) {
        setState({ isLoading: false, isAuthenticated: false });
        return;
      }

      // ── FIX (Problem 1 + 3) ─────────────────────────────────────────────
      // Optimistically expose the stored session to the UI immediately so
      // RequireAuth never unmounts its children while we do async refresh work.
      // If the token needs refreshing, do that in the background and update
      // state once the new token arrives.  If the token is flat-out expired
      // AND we have no refresh token, only then clear and log out.
      // ────────────────────────────────────────────────────────────────────
      const rawUser = storage.getItem(Keys.user);
      const user = rawUser ? (JSON.parse(rawUser) as Record<string, any>) : undefined;

      const leeway = cfg.refreshLeewaySeconds ?? 90;
      const needsRefresh = cfg.useRefreshToken !== false &&
        tokens.refreshToken &&
        shouldRefreshTokens(tokens, leeway);

      const hardExpired = isExpired(tokens, cfg.clockSkewSeconds ?? 60);

      if (hardExpired && !needsRefresh) {
        // Expired with no way to refresh.
        clearAuth(storage);
        setState({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Show the app immediately with what we have in storage.
      setState({ isLoading: false, isAuthenticated: true, tokens, user });

      // Then silently refresh in the background if needed.
      if (needsRefresh) {
        const next = await refreshIfNeeded();
        if (!next) {
          clearAuth(storage);
          setState({ isLoading: false, isAuthenticated: false });
        }
        // setState for the new tokens is handled inside refreshIfNeeded.
      }
    } catch (e: any) {
      clearAuth(storage);
      setState({ isLoading: false, isAuthenticated: false, error: e?.message ?? "Auth error" });
    }
  }, [cfg, finalizeFromCallback, storage, refreshIfNeeded]);

  useEffect(() => { void boot(); }, [boot]);

  // ── FIX (Problem 3) ───────────────────────────────────────────────────────
  // Periodic background refresh: check every minute and proactively refresh
  // before the token expires, so a browser that is left open keeps the user
  // logged in without requiring a manual page reload.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cfg.useRefreshToken === false) return;

    const id = setInterval(async () => {
      const tokens = loadTokens(storage);
      if (!tokens || !tokens.refreshToken) return;

      const leeway = cfg.refreshLeewaySeconds ?? 90;
      if (shouldRefreshTokens(tokens, leeway)) {
        await refreshIfNeeded();
      }
    }, 60_000);

    return () => clearInterval(id);
  }, [cfg.useRefreshToken, cfg.refreshLeewaySeconds, storage, refreshIfNeeded]);

  // ---------- login / logout ----------

  const login = useCallback(async (opts?: { redirectTo?: string }) => {
    const appRedirect = opts?.redirectTo ?? cfg.defaultAppRedirect ?? window.location.pathname;

    const built = await buildAuthorizeUrl(cfg, { appState: appRedirect });
    storage.setItem(Keys.pkceVerifier, built.verifier);
    storage.setItem(Keys.state, built.state);
    storage.setItem(Keys.nonce, built.nonce);
    storage.setItem(Keys.appRedirect, appRedirect);

    window.location.assign(built.url);
  }, [cfg, storage]);

  const logout = useCallback(async () => {
    clearAuth(storage);
    setState({ isLoading: false, isAuthenticated: false });

    if (cfg.endSessionEndpoint) {
      const url = new URL(cfg.endSessionEndpoint);
      if (cfg.postLogoutRedirectUri) url.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
      window.location.assign(url.toString());
    } else if (cfg.postLogoutRedirectUri) {
      window.location.assign(cfg.postLogoutRedirectUri);
    }
  }, [cfg.endSessionEndpoint, cfg.postLogoutRedirectUri, storage]);

  const getAccessToken = useCallback(async () => {
    const tokens = await refreshIfNeeded();
    return tokens?.accessToken;
  }, [refreshIfNeeded]);

  // ---------- context value ----------

  const value = useMemo(() => ({
    ...state,
    config: cfg,
    login,
    logout,
    getAccessToken,
  }), [cfg, login, logout, state, getAccessToken]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}
