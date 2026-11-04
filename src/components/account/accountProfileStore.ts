import { createContext, useContext } from "react";

import type { AccountData } from "@/lib/accountApi";

export interface AccountProfileValue {
  userId: string | null;
  account: AccountData | null;
  loading: boolean;
  error: string | null;
  setAccount: (account: AccountData) => void;
}

export const AccountProfileContext =
  createContext<AccountProfileValue | null>(null);

export function useAccountProfile(): AccountProfileValue {
  const value = useContext(AccountProfileContext);
  if (!value) {
    throw new Error("useAccountProfile requires AccountProfileProvider.");
  }
  return value;
}
