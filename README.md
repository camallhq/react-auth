# @camall/react-auth

OIDC/OAuth 2.0 authentication provider for React, built on the **Authorization Code + PKCE** flow. Handles login, logout, token storage, silent token refresh, and authenticated API requests.

## Features

- Authorization Code flow with PKCE (no client secret required in the browser)
- Automatic token refresh with cross-tab lock to prevent duplicate refresh requests
- Three storage backends: `session`, `local`, and `memory`
- `RequireAuth` guard component that redirects unauthenticated users to the IDP
- `authFetch` helper that automatically attaches `Bearer` tokens to requests
- Full TypeScript support

## Requirements

- React 17, 18, or 19

## Installation

```sh
npm install @camall/react-auth
```

## Quick Start

```tsx
import { AuthProvider, RequireAuth } from "@camall/react-auth";

const config = {
  issuer: "https://c00000.camall.io",
  clientId: "spa-client",
  redirectUri: window.location.origin + "/auth/callback",
  scopes: ["openid", "profile", "email", "offline_access"],
  storage: "session",
};

export function App() {
  return (
    <AuthProvider config={config}>
      <RequireAuth>
        <ProtectedRoutes />
      </RequireAuth>
    </AuthProvider>
  );
}
```

`AuthProvider` must wrap any component that calls `useAuth` or renders `RequireAuth`. On mount it inspects the current URL for an OAuth callback (`?code=&state=`), exchanges the code for tokens if present, and restores an existing session from storage otherwise.

## Configuration Reference

Pass an `AuthConfig` object to `<AuthProvider config={...}>`.

| Property | Type | Default | Description |
|---|---|---|---|
| `issuer` | `string` | **required** | Base URL of the OIDC provider, e.g. `https://idp.example.com/t123` |
| `clientId` | `string` | **required** | OAuth client ID registered with the IDP |
| `redirectUri` | `string` | **required** | Absolute URI the IDP redirects back to after login |
| `authorizeEndpoint` | `string` | `{issuer}/oauth2/authorize` | Override the authorization endpoint |
| `tokenEndpoint` | `string` | `{issuer}/oauth2/token` | Override the token endpoint |
| `userInfoEndpoint` | `string` | `{issuer}/oauth2/userinfo` | Override the userinfo endpoint |
| `endSessionEndpoint` | `string` | — | If set, `logout()` redirects to this URL to end the IDP session |
| `postLogoutRedirectUri` | `string` | — | Where to send the user after the IDP ends the session |
| `scopes` | `string[]` | `["openid","profile","email"]` | OAuth scopes to request. Include `"offline_access"` for refresh tokens |
| `audience` | `string` | — | Resource audience parameter (if required by your IDP) |
| `extraAuthorizeParams` | `Record<string,string>` | — | Additional query parameters appended to the authorization URL |
| `useRefreshToken` | `boolean` | `true` | Enable silent refresh using a refresh token |
| `defaultAppRedirect` | `string` | `window.location.pathname` | App route to land on after login when no target was recorded |
| `storage` | `"session"` \| `"local"` \| `"memory"` | `"session"` | Where tokens are persisted (see [Storage](#storage)) |
| `clockSkewSeconds` | `number` | `60` | Tolerance when deciding if an access token is expired |
| `refreshLeewaySeconds` | `number` | `90` | Refresh the access token this many seconds before it actually expires |
| `refreshLockKey` | `string` | `"ra_refresh_lock"` | Storage key used for the cross-tab refresh lock |
| `refreshLockTtlMs` | `number` | `15000` | How long (ms) the refresh lock can be held before it is force-released |
| `postLoginNavigation` | `"replace" \| "history"` | `"replace"` | Callback completion navigation strategy (`"replace"` does full navigation; `"history"` uses `history.replaceState`) |

## `<RequireAuth>`

Renders `children` only when the user is authenticated. While the session is being restored (`isLoading`) nothing is rendered. If the user is not authenticated, `login()` is called automatically and the component renders nothing.

```tsx
<RequireAuth redirectTo="/dashboard">
  <ProtectedPage />
</RequireAuth>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `redirectTo` | `string` | `window.location.pathname` | App route to return to after login completes |

## `useAuth`

Returns the current auth context. Must be called inside `<AuthProvider>`.

```tsx
import { useAuth } from "@camall/react-auth";

function ProfileButton() {
  const { isLoading, isAuthenticated, user, login, logout } = useAuth();

  if (isLoading) return <span>Loading…</span>;
  if (!isAuthenticated) return <button onClick={() => login()}>Sign in</button>;

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={() => logout()}>Sign out</button>
    </div>
  );
}
```

### Auth context properties

| Name | Type | Description |
|---|---|---|
| `isLoading` | `boolean` | `true` while the provider is restoring or completing the session |
| `isAuthenticated` | `boolean` | `true` when a valid session exists |
| `user` | `Record<string, any> \| undefined` | Decoded claims from the userinfo endpoint |
| `tokens` | `TokenSet \| undefined` | Current token set (access, id, refresh, expiry) |
| `error` | `string \| undefined` | Set when initialization fails |
| `config` | `AuthConfig` | The config passed to `<AuthProvider>` |
| `login(opts?)` | `(opts?: { redirectTo?: string }) => Promise<void>` | Redirect to the IDP login page |
| `logout()` | `() => Promise<void>` | Clear the local session and optionally redirect to the IDP end-session endpoint |
| `getAccessToken()` | `() => Promise<string \| undefined>` | Return a valid access token, refreshing silently if needed |

## `authFetch`

A thin wrapper around `fetch` that injects the `Authorization: Bearer <token>` header and sets `Accept: application/json` by default. Calls `getAccessToken()` internally so the token is always fresh.

```tsx
import { useAuth, authFetch } from "@camall/react-auth";

function DataLoader() {
  const auth = useAuth();

  async function load() {
    const res = await authFetch(auth, "https://api.example.com/me");
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  }

  return <button onClick={load}>Load data</button>;
}
```

`authFetch` accepts the same arguments as the native `fetch` API except that the first argument is the auth context returned by `useAuth()`.

```ts
authFetch(auth, input: RequestInfo | URL, init?: RequestInit): Promise<Response>
```

## Storage

| Value | Persistence | Notes |
|---|---|---|
| `"session"` (default) | Browser tab lifetime | Cleared when the tab is closed |
| `"local"` | Persistent across tabs and restarts | Use with caution — tokens survive browser restarts |
| `"memory"` | Current page lifetime | Nothing is written to `localStorage` or `sessionStorage`; useful for SSR or strict CSP environments |

## Refresh Token Support

Set `useRefreshToken: true` in your config and request the `"offline_access"` scope. The provider automatically refreshes the access token before it expires (`refreshLeewaySeconds` before expiry). A cross-tab storage lock (`refreshLockKey`) prevents multiple tabs from refreshing simultaneously — other tabs wait and then pick up the new token written by the winning tab.

> **IDP requirement:** The IDP must allow refresh tokens for public (PKCE) clients. Token rotation is strongly recommended.

## TypeScript

The package ships its own declarations. The following types are exported:

```ts
import type { AuthConfig, AuthState, TokenSet } from "@camall/react-auth";
```

| Type | Description |
|---|---|
| `AuthConfig` | Configuration object passed to `<AuthProvider>` |
| `AuthState` | `isLoading`, `isAuthenticated`, `user`, `tokens`, `error` |
| `TokenSet` | `accessToken`, `idToken`, `refreshToken`, `tokenType`, `scope`, `expiresAt` |

## License

MIT
