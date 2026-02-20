export type AuthStorage = "memory" | "session" | "local";
export type PostLoginNavigationMode = "replace" | "history";
export type AuthConfig = {
    issuer: string;
    authorizeEndpoint?: string;
    tokenEndpoint?: string;
    userInfoEndpoint?: string;
    endSessionEndpoint?: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri?: string;
    scopes?: string[];
    audience?: string;
    extraAuthorizeParams?: Record<string, string>;
    useRefreshToken?: boolean;
    defaultAppRedirect?: string;
    storage?: AuthStorage;
    clockSkewSeconds?: number;
    refreshLeewaySeconds?: number;
    refreshLockKey?: string;
    refreshLockTtlMs?: number;
    postLoginNavigation?: PostLoginNavigationMode;
};
export type TokenSet = {
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    expiresAt: number;
};
export type AuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    user?: Record<string, any>;
    tokens?: TokenSet;
    error?: string;
};
