// src/react/AuthContext.tsx
import { createContext } from "react";
import type { AuthConfig, AuthState } from "../types";

export type AuthApi = AuthState & {
  config: AuthConfig;
  login: (opts?: { redirectTo?: string }) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | undefined>;
};

export const AuthContext = createContext<AuthApi | undefined>(undefined);
