import { Router } from "express";

import registerRouter from "./auth/register.ts";
import loginRouter from "./auth/login.ts";
import verifyOtpRouter from "./auth/verifyOTP.ts";
import resendOtpRouter from "./auth/resendOtp.ts";

import forgotPasswordRouter from "./auth/forgotPassword.ts";
import verifyResetOTPRouter from "./auth/verifyResetOTP.ts";
import resendResetOTPRouter from "./auth/resendResetOTP.ts";
import resetPasswordRouter from "./auth/resetPassword.ts";

const router = Router();

router.use("/register", registerRouter);
router.use("/login", loginRouter);
router.use("/verify-otp", verifyOtpRouter);
router.use("/resend-otp", resendOtpRouter);

router.use("/forgot-password", forgotPasswordRouter);
router.use("/verify-reset-otp", verifyResetOTPRouter);
router.use("/resend-reset-otp", resendResetOTPRouter);
router.use("/reset-password", resetPasswordRouter);

export default router;
