import type { AuthConfig, TokenSet } from "../types";
export declare function endpoints(cfg: AuthConfig): {
    authorize: string;
    token: string;
    userInfo: string;
    endSession: string | undefined;
};
export declare function buildAuthorizeUrl(cfg: AuthConfig, opts?: {
    appState?: string;
}): Promise<{
    url: string;
    verifier: string;
    state: string;
    nonce: string;
}>;
export declare function exchangeCodeForTokens(cfg: AuthConfig, code: string, verifier: string): Promise<TokenSet>;
export declare function fetchUserInfo(cfg: AuthConfig, accessToken: string): Promise<Record<string, any>>;
export declare function refreshTokens(cfg: AuthConfig, refreshToken: string): Promise<TokenSet>;
