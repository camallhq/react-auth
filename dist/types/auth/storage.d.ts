import type { AuthStorage, TokenSet } from "../types";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export declare function resolveStorage(kind: AuthStorage): StorageLike;
export declare const Keys: {
    pkceVerifier: string;
    state: string;
    nonce: string;
    tokens: string;
    user: string;
    appRedirect: string;
};
export declare function saveTokens(s: StorageLike, tokens: TokenSet): void;
export declare function loadTokens(s: StorageLike): TokenSet | undefined;
export declare function clearAuth(s: StorageLike): void;
export {};
