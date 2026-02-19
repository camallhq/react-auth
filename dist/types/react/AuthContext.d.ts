/// <reference types="react" />
import type { AuthConfig, AuthState } from "../types";
export type AuthApi = AuthState & {
    config: AuthConfig;
    login: (opts?: {
        redirectTo?: string;
    }) => Promise<void>;
    logout: () => Promise<void>;
    getAccessToken: () => Promise<string | undefined>;
};
export declare const AuthContext: import("react").Context<AuthApi | undefined>;
