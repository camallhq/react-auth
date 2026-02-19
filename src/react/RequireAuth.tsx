// src/react/RequireAuth.tsx
import React, { useEffect } from "react";
import { useAuth } from "./useAuth";

export function RequireAuth(props: { children: React.ReactNode; redirectTo?: string }) {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      void auth.login({ redirectTo: props.redirectTo ?? window.location.pathname });
    }
  }, [auth, props.redirectTo]);

  if (auth.isLoading) return null;
  if (!auth.isAuthenticated) return null;

  return <>{props.children}</>;
}
