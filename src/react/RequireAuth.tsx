// src/react/RequireAuth.tsx
import React, { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";

export function RequireAuth(props: { children: React.ReactNode; redirectTo?: string }) {
  const auth = useAuth();

  // Track whether the user has ever been confirmed authenticated in this
  // session so we can keep children mounted during a background re-check
  // instead of unmounting them (which causes the visible "Loading..." flash).
  const wasAuthenticated = useRef(false);
  if (auth.isAuthenticated) {
    wasAuthenticated.current = true;
  }

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      void auth.login({ redirectTo: props.redirectTo ?? window.location.pathname });
    }
  }, [auth, props.redirectTo]);

  // Only block rendering on the very first load before we have ever confirmed
  // authentication.  A background token re-check (isLoading transitions back
  // briefly) must NOT unmount already-rendered children.
  if (auth.isLoading && !wasAuthenticated.current) return null;
  if (!auth.isLoading && !auth.isAuthenticated) return null;

  return <>{props.children}</>;
}
