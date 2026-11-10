export type RememberedIdentifierStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const REMEMBERED_LOGIN_IDENTIFIER_KEY =
  "qroute_remembered_login_identifier";

function getStorage(
  storage?: RememberedIdentifierStorage
): RememberedIdentifierStorage | null {
  if (storage) return storage;

  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedLoginIdentifier(
  storage?: RememberedIdentifierStorage
): string | null {
  const browserStorage = getStorage(storage);
  if (!browserStorage) return null;

  try {
    const identifier = browserStorage.getItem(
      REMEMBERED_LOGIN_IDENTIFIER_KEY
    );
    if (
      !identifier ||
      identifier.length > 254 ||
      identifier.trim() !== identifier
    ) {
      return null;
    }

    return identifier;
  } catch {
    return null;
  }
}

export function updateRememberedLoginIdentifier(
  identifier: string,
  rememberMe: boolean,
  storage?: RememberedIdentifierStorage
): boolean {
  const browserStorage = getStorage(storage);
  if (!browserStorage) return false;

  try {
    if (rememberMe) {
      if (
        !identifier ||
        identifier.length > 254 ||
        identifier.trim() !== identifier
      ) {
        return false;
      }

      browserStorage.setItem(
        REMEMBERED_LOGIN_IDENTIFIER_KEY,
        identifier
      );
    } else {
      browserStorage.removeItem(REMEMBERED_LOGIN_IDENTIFIER_KEY);
    }

    return true;
  } catch {
    return false;
  }
}
