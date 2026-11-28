const GOOGLE_OAUTH_POPUP_PENDING_KEY = "qroute.google-oauth-popup.pending";
export const GOOGLE_OAUTH_POPUP_RESULT_KEY = "qroute.google-oauth-popup.result";
export const GOOGLE_OAUTH_POPUP_STATE_EVENT = "qroute:google-oauth-popup-state";
const GOOGLE_OAUTH_POPUP_MAX_AGE_MS = 10 * 60 * 1000;
export type GoogleOAuthPopupResult = {
    flowId: string;
    status: "success" | "error";
    userId?: string;
    message?: string;
};
type PendingGoogleOAuthPopup = {
    flowId: string;
    startedAt: number;
};
function readPendingGoogleOAuthPopup(): PendingGoogleOAuthPopup | null {
    try {
        const raw = window.localStorage.getItem(GOOGLE_OAUTH_POPUP_PENDING_KEY);
        if (!raw) {
            return null;
        }
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "object" ||
            value === null ||
            !("flowId" in value) ||
            !("startedAt" in value) ||
            typeof value.flowId !== "string" ||
            typeof value.startedAt !== "number") {
            return null;
        }
        const age = Date.now() - value.startedAt;
        if (age < 0 || age > GOOGLE_OAUTH_POPUP_MAX_AGE_MS) {
            window.localStorage.removeItem(GOOGLE_OAUTH_POPUP_PENDING_KEY);
            return null;
        }
        return {
            flowId: value.flowId,
            startedAt: value.startedAt,
        };
    }
    catch {
        return null;
    }
}
function notifyGoogleOAuthPopupStateChanged(): void {
  window.dispatchEvent(new Event(GOOGLE_OAUTH_POPUP_STATE_EVENT));
}

export function getGoogleOAuthPopupFlowStatus(): "pending" | "success" | "error" | null {
  const pending = readPendingGoogleOAuthPopup();

  if (!pending) {
    return null;
  }

  return getGoogleOAuthPopupResult(pending.flowId)?.status ?? "pending";
}

export function beginGoogleOAuthPopupFlow(): string {
    const flowId = crypto.randomUUID();
    const pending: PendingGoogleOAuthPopup = {
        flowId,
        startedAt: Date.now(),
    };
    window.localStorage.removeItem(GOOGLE_OAUTH_POPUP_RESULT_KEY);
    window.localStorage.setItem(GOOGLE_OAUTH_POPUP_PENDING_KEY, JSON.stringify(pending));
    notifyGoogleOAuthPopupStateChanged();
    return flowId;
}
export function getGoogleOAuthPopupResult(flowId: string): GoogleOAuthPopupResult | null {
    try {
        const raw = window.localStorage.getItem(GOOGLE_OAUTH_POPUP_RESULT_KEY);
        if (!raw) {
            return null;
        }
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "object" ||
            value === null ||
            !("flowId" in value) ||
            !("status" in value) ||
            value.flowId !== flowId ||
            (value.status !== "success" && value.status !== "error")) {
            return null;
        }
        return value as GoogleOAuthPopupResult;
    }
    catch {
        return null;
    }
}
export function publishGoogleOAuthPopupResult(result: Omit<GoogleOAuthPopupResult, "flowId">): boolean {
    const pending = readPendingGoogleOAuthPopup();
    if (!pending) {
        return false;
    }
    try {
        const popupResult: GoogleOAuthPopupResult = {
            ...result,
            flowId: pending.flowId,
        };
        window.localStorage.setItem(GOOGLE_OAUTH_POPUP_RESULT_KEY, JSON.stringify(popupResult));
        notifyGoogleOAuthPopupStateChanged();
        return true;
    }
    catch {
        return false;
    }
}
export function clearGoogleOAuthPopupFlow(flowId: string): void {
    try {
        const pending = readPendingGoogleOAuthPopup();
        if (pending?.flowId === flowId) {
            window.localStorage.removeItem(GOOGLE_OAUTH_POPUP_PENDING_KEY);
        }
        const result = getGoogleOAuthPopupResult(flowId);
        if (result?.flowId === flowId) {
            window.localStorage.removeItem(GOOGLE_OAUTH_POPUP_RESULT_KEY);
        }
        notifyGoogleOAuthPopupStateChanged();
    }
    catch {
        // Storage cleanup must never interrupt authentication handling.
    }
}
