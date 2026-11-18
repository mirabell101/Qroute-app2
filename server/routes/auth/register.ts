
import { Router } from "express";
import {
  getSupabaseClient,
  getSupabaseAdminClient,
} from "../../supabaseClient.ts";

const router = Router();

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const GMAIL_REGEX = /^[^\s@]+@gmail\.com$/i;

router.post("/", async (req, res) => {
  try {
    const { username, displayName, email, password } = req.body ?? {};

    if (
      typeof username !== "string" ||
      typeof displayName !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !displayName.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        code: "MISSING_FIELDS",
        message: "All fields are required.",
      });
    }

    const normalizedUsername = username.trim();
    const normalizedDisplayName = displayName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // Validate username.
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_USERNAME",
        message:
          "Username must be 3–30 characters and contain only letters, numbers, or underscores.",
      });
    }

    // Validate lengths.
    if (
      password.length < 8 ||
      password.length > 128 ||
      normalizedEmail.length > 254 ||
      normalizedDisplayName.length > 100
    ) {
      return res.status(400).json({
        success: false,
        code: "INVALID_FIELDS",
        message:
          "One or more fields are invalid or exceed the allowed length.",
      });
    }

    // Enforce Gmail-only registration on the backend.
    if (!GMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_EMAIL",
        message: "Please enter a valid Gmail address.",
      });
    }

    const adminSupabase = getSupabaseAdminClient();

    // Check username case-insensitively.
    // Escape LIKE wildcard characters so underscores are literal.
    const escapedUsername = normalizedUsername.replace(
      /[\\%_]/g,
      "\\$&",
    );

    const { data: existingProfiles, error: usernameError } =
      await adminSupabase
        .from("profiles")
        .select("id")
        .ilike("username", escapedUsername)
        .limit(1);

    if (usernameError) {
      console.error("Registration username lookup error:", usernameError);

      return res.status(500).json({
        success: false,
        code: "REGISTRATION_FAILED",
        message: "Unable to complete registration right now.",
      });
    }

    if (existingProfiles && existingProfiles.length > 0) {
      return res.status(409).json({
        success: false,
        code: "USERNAME_ALREADY_EXISTS",
        message: "This username is already taken. Please choose another.",
      });
    }

    // Check Auth users and linked identities, including Google OAuth.
    const { data: emailExists, error: emailCheckError } =
      await adminSupabase.rpc("registration_email_exists", {
        p_email: normalizedEmail,
      });

    if (emailCheckError) {
      console.error("Registration email lookup error:", emailCheckError);

      return res.status(500).json({
        success: false,
        code: "REGISTRATION_FAILED",
        message: "Unable to complete registration right now.",
      });
    }

    if (emailExists === true) {
      return res.status(409).json({
        success: false,
        code: "EMAIL_ALREADY_EXISTS",
        message: "This email is already registered. Please sign in instead.",
      });
    }

    // Create the Auth account.
    // handle_new_user() will create the profile and registered_user role.
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          username: normalizedUsername,
          display_name: normalizedDisplayName,
        },
      },
    });

    if (error) {
      console.error("Supabase registration error:", {
        code: error.code,
        message: error.message,
      });

      // Handle a duplicate username caught by the database index
      // if another signup wins the race after our preliminary check.
      if (
        error.code === "23505" ||
        error.message?.includes("profiles_username_lower_unique_idx")
      ) {
        return res.status(409).json({
          success: false,
          code: "USERNAME_ALREADY_EXISTS",
          message: "This username is already taken. Please choose another.",
        });
      }

      // Handle duplicate email responses from Supabase Auth.
      if (
        error.code === "user_already_exists" ||
        error.code === "email_exists"
      ) {
        return res.status(409).json({
          success: false,
          code: "EMAIL_ALREADY_EXISTS",
          message: "This email is already registered. Please sign in instead.",
        });
      }

      return res.status(400).json({
        success: false,
        code: "REGISTRATION_FAILED",
        message: "We couldn't complete your registration. Please try again.",
      });
    }

    if (!data.user) {
      return res.status(500).json({
        success: false,
        code: "REGISTRATION_FAILED",
        message: "We couldn't complete your registration. Please try again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: data.session
        ? "Registration successful."
        : "Please check your email for the verification code.",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      requiresEmailVerification: !data.session,
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      code: "REGISTRATION_FAILED",
      message: "An unexpected error occurred during registration.",
    });
  }
});

export default router;
