import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import requireAuth from "../middleware/requireAuth.ts";
import {
  AccountRequestError,
  getAccount,
  type AuthenticatedAccountUser,
  getProfilePhotoUrl,
  isStrongAccountPassword,
  isValidAccountUsername,
  updateAccountPassword,
  updateAccountUsername,
  uploadAccountPhoto,
} from "../account.ts";
import {
  getSupabaseClient,
  getSupabaseClientForAccessToken,
} from "../supabaseClient.ts";

const router = Router();
const PROFILE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const profilePhotoBody = express.raw({
  type: PROFILE_PHOTO_TYPES,
  limit: MAX_PROFILE_PHOTO_BYTES,
});

function getVerifiedUser(res: Response): AuthenticatedAccountUser | null {
  const user = res.locals.user as
    | { id?: unknown; email?: unknown }
    | undefined;
  if (
    typeof user?.id !== "string" ||
    !user.id ||
    typeof user.email !== "string" ||
    !user.email
  ) {
    return null;
  }
  return { id: user.id, email: user.email };
}

function getAccountClient(res: Response) {
  return getSupabaseClientForAccessToken(
    res.locals.accessToken as string,
  );
}

function sendAccountError(res: Response, error: unknown) {
  if (error instanceof AccountRequestError) {
    res.status(error.status).json({ success: false, message: error.message });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    res.status(409).json({
      success: false,
      message: "That username is already in use.",
    });
    return;
  }

  console.error("[account] Account operation failed.");
  res.status(500).json({
    success: false,
    message: "Unable to complete the account request.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

router.use(requireAuth);

router.get("/", async (_req: Request, res: Response) => {
  const user = getVerifiedUser(res);
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }

  try {
    const account = await getAccount(getAccountClient(res), user);
    res.json({ success: true, account });
  } catch (error: unknown) {
    sendAccountError(res, error);
  }
});

router.patch("/", async (req: Request, res: Response) => {
  const user = getVerifiedUser(res);
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  if (
    !isRecord(req.body) ||
    Object.keys(req.body).length !== 1 ||
    typeof req.body.username !== "string"
  ) {
    res.status(400).json({
      success: false,
      message: "Provide a valid username.",
    });
    return;
  }

  const username = req.body.username.trim();
  if (!isValidAccountUsername(username)) {
    res.status(400).json({
      success: false,
      message: "Username must be 3–30 characters and contain only letters, numbers, or underscores.",
    });
    return;
  }

  try {
    const client = getAccountClient(res);
    const savedUsername = await updateAccountUsername(client, user.id, username);
    const profilePhotoUrl = await getProfilePhotoUrl(client, user.id);
    res.json({
      success: true,
      account: {
        email: user.email,
        username: savedUsername,
        profilePhotoUrl,
      },
    });
  } catch (error: unknown) {
    sendAccountError(res, error);
  }
});

router.put("/password", async (req: Request, res: Response) => {
  const user = getVerifiedUser(res);
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }
  if (
    !isRecord(req.body) ||
    Object.keys(req.body).length !== 2 ||
    typeof req.body.currentPassword !== "string" ||
    typeof req.body.newPassword !== "string" ||
    req.body.currentPassword.length < 1 ||
    req.body.currentPassword.length > 128 ||
    !isStrongAccountPassword(req.body.newPassword) ||
    req.body.currentPassword === req.body.newPassword
  ) {
    res.status(400).json({
      success: false,
      message: "Provide your current password and a valid, different new password.",
    });
    return;
  }

  try {
    await updateAccountPassword(
      getSupabaseClient(),
      user,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.json({ success: true, message: "Password updated successfully." });
  } catch (error: unknown) {
    sendAccountError(res, error);
  }
});

router.put("/photo", profilePhotoBody, async (req: Request, res: Response) => {
  const user = getVerifiedUser(res);
  if (!user) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }

  const contentType = req.is(PROFILE_PHOTO_TYPES);
  if (!contentType || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({
      success: false,
      message: "Upload a JPEG, PNG, or WebP profile photo.",
    });
    return;
  }
  if (req.body.length > MAX_PROFILE_PHOTO_BYTES) {
    res.status(413).json({
      success: false,
      message: "Profile photos must be 5 MB or smaller.",
    });
    return;
  }

  try {
    const client = getAccountClient(res);
    await uploadAccountPhoto(client, user.id, req.body, contentType);
    const account = await getAccount(client, user);
    res.json({ success: true, account });
  } catch (error: unknown) {
    sendAccountError(res, error);
  }
});

router.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({
        success: false,
        message: "Profile photos must be 5 MB or smaller.",
      });
      return;
    }
    next(error);
  },
);

export default router;
