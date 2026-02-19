// src/types.ts
export type AuthStorage = "memory" | "session" | "local";

export type AuthConfig = {
  issuer: string;                 // e.g. https://idp.example.com/t123
  authorizeEndpoint?: string;     // defaults to `${issuer}/oauth2/authorize`
  tokenEndpoint?: string;         // defaults to `${issuer}/oauth2/token`
  userInfoEndpoint?: string;      // defaults to `${issuer}/oauth2/userinfo`
  endSessionEndpoint?: string;    // optional

  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri?: string;

  scopes?: string[];              // default: ["openid","profile","email"]
  audience?: string;              // if your IDP supports it
  extraAuthorizeParams?: Record<string, string>;

  // If you do refresh tokens in SPA, your IDP must allow it (rotation recommended).
  useRefreshToken?: boolean;      // true

  // Route to land on after login (if state doesn't specify)
  defaultAppRedirect?: string;

  storage?: AuthStorage;          // default: "session"
  clockSkewSeconds?: number;      // default: 60

  refreshLeewaySeconds?: number;  // default 90 (refresh a bit before expiry)
  refreshLockKey?: string;        // default "ra_refresh_lock"
  refreshLockTtlMs?: number;      // default 15000
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
