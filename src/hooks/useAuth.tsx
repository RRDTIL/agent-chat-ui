"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  name: string;
  email?: string;
  siteRole?: string;
}

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const user: User | null = session?.user
    ? {
        id: session.user.id || "",
        name: session.user.name || "",
        email: session.user.email || undefined,
        siteRole: (session.user as { siteRole?: string }).siteRole,
      }
    : null;

  const isLoading = status === "loading";

  const logout = async () => {
    try {
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return { user, isLoading, logout };
}

