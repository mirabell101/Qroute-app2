
import { Router } from "express";
import {
  getSupabaseClient,
  getSupabaseAdminClient,
} from "../../supabaseClient.ts";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{1,30}$/;

router.post("/", async (req, res) => {
  try {
    const { identifier, email, password } = req.body ?? {};

    // Support both the current "identifier" field
    // and the older "email" field.
    const loginIdentifier = identifier ?? email;

    if (
      typeof loginIdentifier !== "string" ||
      typeof password !== "string" ||
      !loginIdentifier.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email or username and password are required.",
      });
    }

    const normalizedIdentifier = loginIdentifier.trim();

    if (
      password.length > 128 ||
      normalizedIdentifier.length > 254
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email/username or password.",
      });
    }

    // The regular client performs password authentication.
    const supabase = getSupabaseClient();

    let loginEmail: string;

    if (EMAIL_REGEX.test(normalizedIdentifier)) {
      // Email login.
      loginEmail = normalizedIdentifier.toLowerCase();
    } else {
      // Username login.
      if (!USERNAME_REGEX.test(normalizedIdentifier)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid email address or username.",
        });
      }

      // The admin client is only used to look up the username.
      const adminSupabase = getSupabaseAdminClient();

      const { data: profile, error: profileError } =
        await adminSupabase
          .from("profiles")
          .select("id")
          .ilike("username", normalizedIdentifier)
          .maybeSingle();

      if (profileError) {
        console.error("Username lookup error:", profileError);

        return res.status(500).json({
          success: false,
          message:
            "Unable to sign in right now. Please try again.",
        });
      }

      if (!profile) {
        return res.status(401).json({
          success: false,
          message:
            "Unable to sign in. Check your credentials and try again.",
        });
      }

      // Find the email associated with this profile.
      const { data: authUser, error: authUserError } =
        await adminSupabase.auth.admin.getUserById(profile.id);

      if (authUserError || !authUser.user?.email) {
        if (authUserError) {
          console.error(
            "Username account lookup error:",
            authUserError,
          );
        }

        return res.status(401).json({
          success: false,
          message:
            "Unable to sign in. Check your credentials and try again.",
        });
      }

      loginEmail = authUser.user.email;
    }

    // Authenticate with the user's email and password.
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

    // Tell the frontend when Supabase specifically reports
    // that the email has not been confirmed.
    if (error?.code === "email_not_confirmed") {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        requiresEmailVerification: true,
        email: loginEmail,
        message:
          "Please verify your email address to continue.",
      });
    }

    // Handle incorrect credentials and other authentication errors.
    if (error || !data.session || !data.user) {
      return res.status(401).json({
        success: false,
        message:
          "Unable to sign in. Check your credentials and try again.",
      });
    }

    // Successful login.
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username ?? null,
        displayName:
          data.user.user_metadata?.display_name ?? null,
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message:
        "An unexpected error occurred during login.",
    });
  }
});

export default router;
