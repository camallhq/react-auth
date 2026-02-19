import React, { createContext, useMemo, useState, useCallback, useEffect, useContext } from 'react';

const AuthContext = createContext(undefined);

function resolveStorage(kind) {
    if (kind === "local")
        return window.localStorage;
    if (kind === "session")
        return window.sessionStorage;
    const mem = {};
    return {
        getItem: (k) => { var _a; return (k in mem ? (_a = mem[k]) !== null && _a !== void 0 ? _a : null : null); },
        setItem: (k, v) => void (mem[k] = v),
        removeItem: (k) => void delete mem[k],
    };
}
const Keys = {
    pkceVerifier: "ra_pkce_verifier",
    state: "ra_state",
    nonce: "ra_nonce",
    tokens: "ra_tokens",
    user: "ra_user",
};
function saveTokens(s, tokens) {
    s.setItem(Keys.tokens, JSON.stringify(tokens));
}
function loadTokens(s) {
    const raw = s.getItem(Keys.tokens);
    if (!raw)
        return undefined;
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        return undefined;
    }
}
function clearAuth(s) {
    s.removeItem(Keys.tokens);
    s.removeItem(Keys.user);
    s.removeItem(Keys.pkceVerifier);
    s.removeItem(Keys.state);
    s.removeItem(Keys.nonce);
}

const encoder = new TextEncoder();
function base64UrlEncode(bytes) {
    let str = "";
    bytes.forEach((b) => (str += String.fromCharCode(b)));
    const b64 = btoa(str);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomString(bytes = 32) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return base64UrlEncode(arr);
}
async function sha256Base64Url(input) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
    return base64UrlEncode(new Uint8Array(digest));
}

function endpoints(cfg) {
    var _a, _b, _c;
    const base = cfg.issuer.replace(/\/+$/, "");
    return {
        authorize: (_a = cfg.authorizeEndpoint) !== null && _a !== void 0 ? _a : `${base}/oauth2/authorize`,
        token: (_b = cfg.tokenEndpoint) !== null && _b !== void 0 ? _b : `${base}/oauth2/token`,
        userInfo: (_c = cfg.userInfoEndpoint) !== null && _c !== void 0 ? _c : `${base}/oauth2/userinfo`,
        endSession: cfg.endSessionEndpoint,
    };
}
async function buildAuthorizeUrl(cfg, opts) {
    var _a;
    const { authorize } = endpoints(cfg);
    const verifier = randomString(32);
    const challenge = await sha256Base64Url(verifier);
    const state = randomString(16);
    const nonce = randomString(16);
    const scopes = (((_a = cfg.scopes) === null || _a === void 0 ? void 0 : _a.length) ? cfg.scopes : ["openid", "profile", "email"]).join(" ");
    const url = new URL(authorize);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    if (cfg.audience)
        url.searchParams.set("audience", cfg.audience);
    if (opts === null || opts === void 0 ? void 0 : opts.appState)
        url.searchParams.set("app_state", opts.appState);
    if (cfg.extraAuthorizeParams) {
        for (const [k, v] of Object.entries(cfg.extraAuthorizeParams))
            url.searchParams.set(k, v);
    }
    return { url: url.toString(), verifier, state, nonce };
}
async function exchangeCodeForTokens(cfg, code, verifier) {
    var _a;
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
    if (!res.ok)
        throw new Error(`Token exchange failed (${res.status})`);
    const json = await res.json();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Number((_a = json.expires_in) !== null && _a !== void 0 ? _a : 3600);
    return {
        accessToken: json.access_token,
        idToken: json.id_token,
        refreshToken: json.refresh_token,
        tokenType: json.token_type,
        scope: json.scope,
        expiresAt: now + expiresIn,
    };
}
async function fetchUserInfo(cfg, accessToken) {
    const { userInfo } = endpoints(cfg);
    const res = await fetch(userInfo, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok)
        throw new Error(`UserInfo failed (${res.status})`);
    return (await res.json());
}
async function refreshTokens(cfg, refreshToken) {
    var _a, _b;
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
    if (!res.ok)
        throw new Error(`Refresh failed (${res.status})`);
    const json = (await res.json());
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = Number((_a = json.expires_in) !== null && _a !== void 0 ? _a : 3600);
    return {
        accessToken: json.access_token,
        idToken: json.id_token,
        refreshToken: (_b = json.refresh_token) !== null && _b !== void 0 ? _b : refreshToken,
        tokenType: json.token_type,
        scope: json.scope,
        expiresAt: now + expiresIn,
    };
}

function tryAcquireLock(storage, key, ttlMs) {
    const now = Date.now();
    const raw = storage.getItem(key);
    if (raw) {
        const lockUntil = Number(raw);
        if (!Number.isNaN(lockUntil) && lockUntil > now)
            return false;
    }
    storage.setItem(key, String(now + ttlMs));
    return true;
}
function releaseLock(storage, key) {
    storage.removeItem(key);
}
async function waitForUnlock(storage, key, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const raw = storage.getItem(key);
        if (!raw)
            return;
        const until = Number(raw);
        if (Number.isNaN(until) || until <= Date.now()) {
            storage.removeItem(key);
            return;
        }
        await new Promise((r) => setTimeout(r, 150));
    }
}

function isExpired(tokens, skewSeconds) {
    const now = Math.floor(Date.now() / 1000);
    return tokens.expiresAt - skewSeconds <= now;
}
function AuthProvider(props) {
    const cfg = props.config;
    const storage = useMemo(() => { var _a; return resolveStorage((_a = cfg.storage) !== null && _a !== void 0 ? _a : "session"); }, [cfg.storage]);
    const [state, setState] = useState({
        isLoading: true,
        isAuthenticated: false,
    });
    const finalizeFromCallback = useCallback(async () => {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        if (!code || !returnedState)
            return false;
        const expectedState = storage.getItem(Keys.state);
        const verifier = storage.getItem(Keys.pkceVerifier);
        if (!expectedState || expectedState !== returnedState || !verifier) {
            throw new Error("Invalid auth callback (state/verifier mismatch)");
        }
        const tokens = await exchangeCodeForTokens(cfg, code, verifier);
        saveTokens(storage, tokens);
        const user = await fetchUserInfo(cfg, tokens.accessToken);
        storage.setItem(Keys.user, JSON.stringify(user));
        url.searchParams.delete("code");
        url.searchParams.delete("state");
        window.history.replaceState({}, document.title, url.toString());
        setState({ isLoading: false, isAuthenticated: true, tokens, user });
        return true;
    }, [cfg, storage]);
    const boot = useCallback(async () => {
        var _a, _b;
        try {
            const handled = await finalizeFromCallback();
            if (handled)
                return;
            const tokens = loadTokens(storage);
            if (!tokens) {
                setState({ isLoading: false, isAuthenticated: false });
                return;
            }
            if (tokens && cfg.useRefreshToken && tokens.refreshToken && shouldRefresh(tokens)) {
                const next = await refreshIfNeeded();
                if (!next) {
                    setState({ isLoading: false, isAuthenticated: false });
                    return;
                }
                setState((s) => ({ ...s, isLoading: false, isAuthenticated: true, tokens: next }));
                return;
            }
            if (isExpired(tokens, (_a = cfg.clockSkewSeconds) !== null && _a !== void 0 ? _a : 60)) {
                clearAuth(storage);
                setState({ isLoading: false, isAuthenticated: false });
                return;
            }
            const rawUser = storage.getItem(Keys.user);
            const user = rawUser ? JSON.parse(rawUser) : undefined;
            setState({ isLoading: false, isAuthenticated: true, tokens, user });
        }
        catch (e) {
            clearAuth(storage);
            setState({ isLoading: false, isAuthenticated: false, error: (_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : "Auth error" });
        }
    }, [cfg.clockSkewSeconds, finalizeFromCallback, storage]);
    useEffect(() => { void boot(); }, [boot]);
    const login = useCallback(async (opts) => {
        var _a, _b;
        const appRedirect = (_b = (_a = opts === null || opts === void 0 ? void 0 : opts.redirectTo) !== null && _a !== void 0 ? _a : cfg.defaultAppRedirect) !== null && _b !== void 0 ? _b : window.location.pathname;
        const built = await buildAuthorizeUrl(cfg, { appState: appRedirect });
        storage.setItem(Keys.pkceVerifier, built.verifier);
        storage.setItem(Keys.state, built.state);
        storage.setItem(Keys.nonce, built.nonce);
        window.location.assign(built.url);
    }, [cfg, storage]);
    const logout = useCallback(async () => {
        clearAuth(storage);
        setState({ isLoading: false, isAuthenticated: false });
        if (cfg.endSessionEndpoint) {
            const url = new URL(cfg.endSessionEndpoint);
            if (cfg.postLogoutRedirectUri)
                url.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
            window.location.assign(url.toString());
        }
        else if (cfg.postLogoutRedirectUri) {
            window.location.assign(cfg.postLogoutRedirectUri);
        }
    }, [cfg.endSessionEndpoint, cfg.postLogoutRedirectUri, storage]);
    const shouldRefresh = (tokens) => {
        var _a;
        const now = Math.floor(Date.now() / 1000);
        const leeway = (_a = cfg.refreshLeewaySeconds) !== null && _a !== void 0 ? _a : 90;
        return tokens.expiresAt - leeway <= now;
    };
    const refreshIfNeeded = useCallback(async () => {
        var _a, _b;
        const tokens = loadTokens(storage);
        if (!tokens)
            return undefined;
        if (!cfg.useRefreshToken)
            return tokens;
        if (!tokens.refreshToken)
            return tokens;
        if (!shouldRefresh(tokens))
            return tokens;
        const lockKey = (_a = cfg.refreshLockKey) !== null && _a !== void 0 ? _a : "ra_refresh_lock";
        const ttl = (_b = cfg.refreshLockTtlMs) !== null && _b !== void 0 ? _b : 15000;
        if (!tryAcquireLock(storage, lockKey, ttl)) {
            await waitForUnlock(storage, lockKey, 6000);
            return loadTokens(storage);
        }
        try {
            const next = await refreshTokens(cfg, tokens.refreshToken);
            saveTokens(storage, next);
            setState((s) => ({ ...s, isAuthenticated: true, tokens: next }));
            return next;
        }
        finally {
            releaseLock(storage, lockKey);
        }
    }, [cfg, storage]);
    const getAccessToken = useCallback(async () => {
        const tokens = await refreshIfNeeded();
        return tokens === null || tokens === void 0 ? void 0 : tokens.accessToken;
    }, [refreshIfNeeded]);
    const value = useMemo(() => ({
        ...state,
        config: cfg,
        login,
        logout,
        getAccessToken,
    }), [cfg, login, logout, state, getAccessToken]);
    return React.createElement(AuthContext.Provider, { value: value }, props.children);
}

function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used within <AuthProvider />");
    return ctx;
}

function RequireAuth(props) {
    const auth = useAuth();
    useEffect(() => {
        var _a;
        if (!auth.isLoading && !auth.isAuthenticated) {
            void auth.login({ redirectTo: (_a = props.redirectTo) !== null && _a !== void 0 ? _a : window.location.pathname });
        }
    }, [auth, props.redirectTo]);
    if (auth.isLoading)
        return null;
    if (!auth.isAuthenticated)
        return null;
    return React.createElement(React.Fragment, null, props.children);
}

async function authFetch(auth, input, init) {
    var _a, _b;
    const token = await auth.getAccessToken();
    const headers = new Headers((_a = init === null || init === void 0 ? void 0 : init.headers) !== null && _a !== void 0 ? _a : {});
    if (token)
        headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", (_b = headers.get("Accept")) !== null && _b !== void 0 ? _b : "application/json");
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401) ;
    return res;
}

export { AuthProvider, RequireAuth, authFetch, useAuth };
//# sourceMappingURL=index.esm.js.map
