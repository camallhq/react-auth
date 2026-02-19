// src/react/authFetch.ts
import type { AuthApi } from "./AuthContext";

export async function authFetch(auth: Pick<AuthApi, "getAccessToken" | "logout">, input: RequestInfo | URL, init?: RequestInit) {
  const token = await auth.getAccessToken();

  const headers = new Headers(init?.headers ?? {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", headers.get("Accept") ?? "application/json");

  const res = await fetch(input, { ...init, headers });

  // If API says unauthorized, you can choose to logout or just bubble up.
  if (res.status === 401) {
    // optional: await auth.logout();
  }

  return res;
}
