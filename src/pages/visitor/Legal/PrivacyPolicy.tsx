import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import qrouteLogo from "@/assets/logoboi.png";

function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <main className="relative min-h-screen w-full bg-white px-4 py-10">
      {/* TOP-LEFT LOGO */}
      <img
        src={qrouteLogo}
        alt="Qroute"
        className="absolute left-15 top-10 h-auto w-[160px] object-contain"
      />

      {/* CONTENT CARD */}
      <div className="mx-auto mt-20 w-full max-w-[800px] rounded-[6px] border border-[#e1e1e1] bg-white px-10 py-8 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
        {/* HEADER */}
        <div className="border-b border-[#e1e1e1] pb-5">
          <h1 className="text-[28px] font-bold tracking-[-0.5px] text-black">
            Privacy Policy
          </h1>

          <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
            This Privacy Policy explains how QRoute collects, uses, stores,
            and protects user information.
          </p>
        </div>

        {/* CONTENT */}
        <div className="mt-6 space-y-6 text-[12px] leading-[1.7] text-gray-700">
          <p>
            QRoute respects the privacy of its users. This Privacy Policy
            explains how QRoute collects, uses, stores, and protects user
            information.
          </p>

          {/* 1. INFORMATION WE COLLECT */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              1. Information We Collect
            </h2>

            <p>QRoute may collect the following information:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Name or username.</li>
              <li>Email address.</li>
              <li>Password in protected or encrypted form.</li>
              <li>Profile information provided by the user.</li>
              <li>
                Location information, only when the user gives permission.
              </li>
              <li>
                Route searches, fare contributions, reports, and feedback.
              </li>
              <li>Points, badges, and contribution activity.</li>
              <li>
                Technical information, such as browser type, device type, and
                date and time of system access.
              </li>
            </ul>
          </section>

          {/* 2. HOW WE USE INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              2. How We Use Information
            </h2>

            <p>QRoute uses collected information to:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Create and manage user accounts.</li>
              <li>Authenticate users during login.</li>
              <li>Provide route-searching and travel guidance.</li>
              <li>
                Identify a user’s starting location when geolocation permission
                is granted.
              </li>
              <li>Generate route suggestions and fare estimates.</li>
              <li>Review fare contributions, reports, and feedback.</li>
              <li>Award points and badges for valid contributions.</li>
              <li>
                Detect suspicious, abusive, or harmful activity.
              </li>
              <li>
                Improve QRoute’s accuracy, reliability, security, and usability.
              </li>
            </ul>
          </section>

          {/* 3. LOCATION INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              3. Location Information
            </h2>

            <p>
              QRoute may request access to the user’s current location to
              identify their starting point and provide relevant route
              suggestions.
            </p>

            <p className="mt-2">
              Location access is optional. Users may choose to enter their
              origin manually instead of allowing location access. Users may
              also disable location permission through their browser or device
              settings.
            </p>

            <p className="mt-2">
              QRoute will only use location information for route-searching and
              related system functions.
            </p>
          </section>

          {/* 4. CROWDSOURCED INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              4. Crowdsourced Information
            </h2>

            <p>
              QRoute allows users to submit fare information, route updates,
              reports, and feedback. These contributions may be combined with
              information from other users to improve route details and fare
              estimates.
            </p>

            <p className="mt-2">
              QRoute will not publicly display sensitive personal details such
              as passwords, email addresses, home addresses, or exact location
              information.
            </p>
          </section>

          {/* 5. AI-ASSISTED MODERATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              5. AI-Assisted Moderation
            </h2>

            <p>
              QRoute may use AI-assisted tools to identify reports, user
              accounts, or route submissions that may require administrator
              review.
            </p>

            <p className="mt-2">
              AI-assisted moderation is only used to help identify possible
              issues. The administrator will review the information before
              making a final moderation decision, such as removing content,
              restricting an account, or applying a shadowban.
            </p>
          </section>

          {/* 6. DATA PROTECTION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              6. Data Protection
            </h2>

            <p>
              QRoute uses reasonable security measures to protect user
              information. These may include:
            </p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Secure account authentication.</li>
              <li>Protected password storage.</li>
              <li>Restricted administrator access.</li>
              <li>Database security measures.</li>
              <li>Monitoring for suspicious system activity.</li>
            </ul>

            <p className="mt-2">
              However, users must also protect their accounts by keeping their
              passwords private and avoiding sharing login credentials with
              others.
            </p>
          </section>

          {/* 7. SHARING OF INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              7. Sharing of Information
            </h2>

            <p>QRoute will not sell users’ personal information.</p>

            <p className="mt-2">
              Information may only be accessed by authorized administrators or
              used when necessary to:
            </p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Operate and maintain the system.</li>
              <li>Review reports and user contributions.</li>
              <li>
                Protect the system from abuse or unauthorized access.
              </li>
              <li>
                Comply with school, legal, or institutional requirements.
              </li>
            </ul>
          </section>

          {/* 8. USER RIGHTS */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              8. User Rights
            </h2>

            <p>Users may request to:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Update their account information.</li>
              <li>Correct inaccurate profile details.</li>
              <li>Change their password.</li>
              <li>Disable location access.</li>
              <li>Request account deactivation or deletion.</li>
              <li>Ask questions about how their data is used.</li>
            </ul>

            <p className="mt-2">
              Some information may be retained when necessary for system
              security, report investigation, documentation, or legal
              requirements.
            </p>
          </section>

          {/* 9. CHANGES TO THIS PRIVACY POLICY */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              9. Changes to This Privacy Policy
            </h2>

            <p>
              QRoute may update this Privacy Policy when system features,
              security practices, or data-handling procedures change. The
              updated policy will be posted in the system.
            </p>
          </section>

          {/* 10. CONTACT INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              10. Contact Information
            </h2>

            <p>
              For privacy questions, concerns, or requests, users may contact:
            </p>

            <div className="mt-3 rounded-[5px] bg-[#f7f7f7] px-4 py-3">
              <p className="font-medium text-black">
                QRoute Privacy Administrator
              </p>
              <p className="mt-1">Email: [Insert Official QRoute Email]</p>
            </div>
          </section>
        </div>

        {/* BACK BUTTON */}
        <div className="mt-8 border-t border-[#e1e1e1] pt-5">
          <Button
            type="button"
            onClick={() => navigate("/signup")}
            className="h-9 rounded-[6px] bg-[#6355F5] px-6 text-[11px] font-medium text-white shadow-none hover:bg-[#5547E8]"
          >
            Back to Sign Up
          </Button>
        </div>
      </div>
    </main>
  );
}

export default PrivacyPolicy;