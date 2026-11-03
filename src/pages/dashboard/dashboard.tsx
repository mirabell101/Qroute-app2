import { useState } from "react";
import type { User } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type DashboardProps = {
  user: User;
};

function Dashboard({ user }: DashboardProps) {
  const [isLoading, setIsLoading] = useState(false);

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "User";

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  const provider = user.app_metadata?.provider || "email";

  async function handleSignOut() {
    setIsLoading(true);
    await supabase.auth.signOut();
    // The auth state change listener in App.tsx will handle the redirect
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-[480px] rounded-[6px] border border-[#333] px-10 py-9">
        <div className="text-center">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt=""
              className="mx-auto mb-4 h-16 w-16 rounded-full"
              referrerPolicy="no-referrer"
            />
          )}
          <h1 className="text-[28px] font-bold text-black">
            Welcome, {displayName}!
          </h1>
          <p className="mt-2 text-sm text-gray-600">{user.email}</p>
          <p className="mt-1 text-xs text-gray-400">
            Signed in with{" "}
            {provider === "google" ? "Google" : "email and password"}
          </p>
        </div>

        <div className="mt-8 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-black">
            QRoute Dashboard
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Your route-management features will appear here.
          </p>
        </div>

        <Button
          type="button"
          disabled={isLoading}
          onClick={handleSignOut}
          className="mt-8 h-12 w-full rounded-full bg-[#6C3FF5] text-white hover:bg-[#5B32D6]"
        >
          {isLoading ? "Signing out..." : "Sign Out"}
        </Button>
      </div>
    </main>
  );
}

export default Dashboard;
