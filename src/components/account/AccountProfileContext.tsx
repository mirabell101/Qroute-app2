import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { getAccount } from "@/lib/accountApi";
import type { AccountData } from "@/lib/accountApi";
import {
  loadAccountProfileOnce,
  selectAccountProfileState,
  updateAccountProfileState,
} from "./accountProfileModel";
import type { AccountProfileSnapshot } from "./accountProfileModel";
import { AccountProfileContext } from "./accountProfileStore";

export function AccountProfileProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<AccountProfileSnapshot>(() => ({
    userId,
    account: null,
    loading: Boolean(userId),
    error: null,
  }));
  const visibleState = selectAccountProfileState(state, userId);

  useEffect(() => {
    let active = true;
    if (!userId) {
      return () => {
        active = false;
      };
    }

    void loadAccountProfileOnce(userId, getAccount).then((nextState) => {
      if (!active) return;
      if (nextState.error) {
        console.error("Could not load account profile:", nextState.error);
      }
      setState(nextState);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const setAccount = useCallback(
    (account: AccountData) => {
      setState((state) => updateAccountProfileState(state, userId, account));
    },
    [userId],
  );

  const value = useMemo(
    () => ({
      ...visibleState,
      setAccount,
    }),
    [visibleState, setAccount],
  );

  return (
    <AccountProfileContext.Provider value={value}>
      {children}
    </AccountProfileContext.Provider>
  );
}
