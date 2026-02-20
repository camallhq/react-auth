// src/types.ts
export type AuthStorage = "memory" | "session" | "local";
export type PostLoginNavigationMode = "replace" | "history";

/**
 * AuthConfig defines the configuration options for the authentication system.
 * It includes details about the OIDC provider, client application, and token management.
 */
export type AuthConfig = {
  issuer: string;                 // e.g. https://c0000.camall.io/common
  authorizeEndpoint?: string;     // defaults to `${issuer}/oidc/authorize`
  tokenEndpoint?: string;         // defaults to `${issuer}/oidc/token`
  userInfoEndpoint?: string;      // defaults to `${issuer}/oidc/userinfo`
  endSessionEndpoint?: string;    // optional

  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;

  scopes?: string[];              // default: ["openid","profile","email"]
  audience?: string;              // if your IDP supports it
  extraAuthorizeParams?: Record<string, string>;

  // If you do refresh tokens in SPA, your IDP must allow it (rotation recommended).
  useRefreshToken?: boolean;      // default, true

  // Route to land on after login (if state doesn't specify)
  defaultAppRedirect?: string;

  storage?: AuthStorage;          // default: "session"
  clockSkewSeconds?: number;      // default: 60

  refreshLeewaySeconds?: number;  // default 90 (refresh a bit before expiry)
  refreshLockKey?: string;        // default "ra_refresh_lock"
  refreshLockTtlMs?: number;      // default 15000

  // How to navigate after handling OAuth callback.
  // "replace" performs a full navigation (default, router-safe).
  // "history" only updates URL with history.replaceState.
  postLoginNavigation?: PostLoginNavigationMode;
};

export type TokenSet = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt: number; // epoch seconds
};

export type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  user?: Record<string, any>;
  tokens?: TokenSet;
  error?: string;
};
