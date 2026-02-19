# Camall React Authentication Provider
Camall react authentication provider.

## Using
```js
import { AuthProvider, RequireAuth } from "@your-scope/react-auth";

const config = {
  issuer: "https://t123.your-idp.com",
  clientId: "spa-client",
  redirectUri: window.location.origin + "/auth/callback",
  scopes: ["openid", "profile", "email", "offline_access"], // only if you support refresh tokens
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

## Using authfetch
```js
import { useAuth, authFetch } from "@your-scope/react-auth";

function Example() {
  const auth = useAuth();

  const load = async () => {
    const res = await authFetch(auth, "https://api.example.com/me");
    if (!res.ok) throw new Error("API failed");
    return res.json();
  };

  return null;
}
```
