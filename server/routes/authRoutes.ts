import { Router } from "express";

import registerRouter from "./auth/register.ts";
import loginRouter from "./auth/login.ts";
import verifyOtpRouter from "./auth/verifyOTP.ts";
import resendOtpRouter from "./auth/resendOtp.ts";

const router = Router();

router.use("/register", registerRouter);
router.use("/login", loginRouter);
router.use("/verify-otp", verifyOtpRouter);
router.use("/resend-otp", resendOtpRouter);

export default router;
