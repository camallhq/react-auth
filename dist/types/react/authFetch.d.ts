import type { AuthApi } from "./AuthContext";
export declare function authFetch(auth: Pick<AuthApi, "getAccessToken" | "logout">, input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
