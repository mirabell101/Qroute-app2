import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getAccount } from "@/lib/accountApi";

import {
  loadAccountProfileOnce,
  selectAccountProfileState,
  updateAccountProfileState,
  type AccountProfileSnapshot,
} from "./AccountProfileContext";

import {
  AccountProfileContext,
  type AccountProfileValue,
} from "./accountProfileStore";

// ============================================================
// TYPES
// ============================================================

interface AccountProfileProviderProps {
  children: ReactNode;
  userId: string | null;
  sessionGeneration: number | null;
}

// ============================================================
// INITIAL STATE
// ============================================================

const INITIAL_PROFILE_STATE: AccountProfileSnapshot = {
  userId: null,
  sessionGeneration: null,
  account: null,
  loading: false,
  error: null,
};

// ============================================================
// PROVIDER
// ============================================================

export function AccountProfileProvider({
  children,
  userId,
  sessionGeneration,
}: AccountProfileProviderProps) {
  const [profileState, setProfileState] =
    useState<AccountProfileSnapshot>(INITIAL_PROFILE_STATE);

  // ==========================================================
  // LOAD PROFILE FOR THE CURRENT SESSION
  // ==========================================================

  useEffect(() => {
    let active = true;

    if (!userId || sessionGeneration === null) {
      setProfileState({
        userId,
        sessionGeneration,
        account: null,
        loading: false,
        error: null,
      });

      return () => {
        active = false;
      };
    }

    // Start with state belonging only to this identity.
    setProfileState((current) => {
      const selected = selectAccountProfileState(
        current,
        userId,
        sessionGeneration,
      );

      return {
        ...selected,
        loading: true,
        error: null,
      };
    });

    /**
     * Pending requests are deduplicated by user ID and
     * session generation.
     *
     * A previous session cannot overwrite the current
     * session's profile state.
     */
    void loadAccountProfileOnce(
      userId,
      sessionGeneration,
      getAccount,
    ).then((nextState) => {
      if (!active) {
        return;
      }

      setProfileState(nextState);
    });

    return () => {
      active = false;
    };
  }, [userId, sessionGeneration]);

  // ==========================================================
  // CURRENT PROFILE STATE
  // ==========================================================

  const selectedProfileState = useMemo(
    () =>
      selectAccountProfileState(
        profileState,
        userId,
        sessionGeneration,
      ),
    [profileState, userId, sessionGeneration],
  );

  // ==========================================================
  // UPDATE PROFILE
  // ==========================================================

  const setAccount = useCallback(
    (account: NonNullable<AccountProfileSnapshot["account"]>) => {
      setProfileState((current) =>
        updateAccountProfileState(
          current,
          userId,
          sessionGeneration,
          account,
        ),
      );
    },
    [userId, sessionGeneration],
  );

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const contextValue = useMemo<AccountProfileValue>(
    () => ({
      userId,
      account: selectedProfileState.account,
      loading: selectedProfileState.loading,
      error: selectedProfileState.error,
      setAccount,
    }),
    [
      userId,
      selectedProfileState.account,
      selectedProfileState.loading,
      selectedProfileState.error,
      setAccount,
    ],
  );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <AccountProfileContext.Provider value={contextValue}>
      {children}
    </AccountProfileContext.Provider>
  );
}