export function validateRecoveryEmail(value: string): string {
  const email = value.trim();
  if (!email) {
    return "Email address is required.";
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@gmail\.com$/i.test(email)
  ) {
    return "Please enter a valid Gmail address.";
  }

  return "";
}

export function validateRecoveryPassword(value: string): string {
  if (!value) {
    return "Password is required.";
  }

  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (value.length > 128) {
    return "Password must be 128 characters or fewer.";
  }

  if (!/[A-Z]/.test(value)) {
    return "Password must contain at least one uppercase letter.";
  }

  if (!/[a-z]/.test(value)) {
    return "Password must contain at least one lowercase letter.";
  }

  if (!/[0-9]/.test(value)) {
    return "Password must contain at least one number.";
  }

  if (!/[!@#$%^&*(),.?":{}|<>_\-\\]/.test(value)) {
    return "Password must contain at least one special character.";
  }

  return "";
}

export function validateRecoveryPasswordConfirmation(
  password: string,
  confirmation: string,
): string {
  if (!confirmation) {
    return "Please confirm your password.";
  }

  return confirmation === password ? "" : "Passwords do not match.";
}

export function isPasswordRecoveryCallback(
  search: string,
  hash: string,
): boolean {
  const searchParams = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const hashParams = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );

  return (
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

export function shouldPersistSupabaseSession(pathname: string): boolean {
  const normalizedPathname =
    pathname.replace(/\/+$/, "").toLowerCase() || "/";

  return (
    normalizedPathname !== "/resetpassword" &&
    normalizedPathname !== "/reset-password"
  );
}
