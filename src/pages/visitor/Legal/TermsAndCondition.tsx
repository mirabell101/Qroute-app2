import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import qrouteLogo from "@/assets/logoboi.png";

function TermsAndCondition() {
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
            Terms and Conditions
          </h1>

          <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
            Please read these Terms and Conditions carefully before using
            QRoute.
          </p>
        </div>

        {/* CONTENT */}
        <div className="mt-6 space-y-6 text-[12px] leading-[1.7] text-gray-700">
          <p>
            Welcome to QRoute, a web-based platform designed to help commuters
            find possible bus, jeepney, and train routes within Quezon City.
          </p>

          <p>
            By creating an account or using QRoute, you agree to the following
            terms:
          </p>

          {/* 1. USE OF QROUTE */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              1. Use of QRoute
            </h2>

            <p>
              QRoute provides route suggestions, transportation information,
              and estimated fares for informational purposes only. Route
              availability, transportation schedules, fares, traffic
              conditions, and travel times may change without notice.
            </p>

            <p className="mt-2">
              Users are responsible for verifying route details, fare amounts,
              and transportation availability before traveling.
            </p>
          </section>

          {/* 2. USER ACCOUNTS */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              2. User Accounts
            </h2>

            <p>
              Users may be required to create an account to access selected
              QRoute features, including fare contribution, reporting, points,
              badges, and profile management.
            </p>

            <p className="mt-2">Users must:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide correct and complete account information.</li>
              <li>Keep their password confidential.</li>
              <li>Not share their account with another person.</li>
              <li>
                Notify the administrator if they suspect unauthorized access to
                their account.
              </li>
            </ul>

            <p className="mt-2">
              QRoute may suspend or restrict an account that provides false
              information or violates these terms.
            </p>
          </section>

          {/* 3. ROUTE AND FARE ESTIMATES */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              3. Route and Fare Estimates
            </h2>

            <p>
              Route recommendations and fare estimates displayed by QRoute are
              based on available route information and user-submitted
              contributions. These are estimates only and may not reflect the
              exact fare charged by a driver or transport operator.
            </p>

            <p className="mt-2">
              QRoute is not responsible for incorrect fare information, route
              changes, transportation delays, missed trips, traffic
              congestion, or other travel-related concerns.
            </p>
          </section>

          {/* 4. USER CONTRIBUTIONS */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              4. User Contributions
            </h2>

            <p>
              Users may contribute fare information, route updates, reports,
              and feedback to improve the system.
            </p>

            <p className="mt-2">By submitting information, the user agrees that:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                The submitted information is accurate to the best of their
                knowledge.
              </li>
              <li>
                The information is related to public transportation within the
                system coverage.
              </li>
              <li>
                The submission does not contain offensive, false, harmful, or
                misleading content.
              </li>
              <li>
                The submission does not violate another person’s privacy.
              </li>
            </ul>

            <p className="mt-2">
              QRoute may review, edit, reject, or remove submitted information
              that is inaccurate, inappropriate, or harmful.
            </p>
          </section>

          {/* 5. POINTS AND BADGES */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              5. Points and Badges
            </h2>

            <p>
              Users may receive points and badges for valid contributions such
              as submitting fare information or helping improve route details.
            </p>

            <p className="mt-2">
              Points and badges are for digital recognition only. They have no
              monetary value and cannot be exchanged for cash, transportation
              fares, products, or services.
            </p>

            <p className="mt-2">
              QRoute may remove points or badges obtained through false
              submissions, multiple accounts, fraud, or other abusive activity.
            </p>
          </section>

          {/* 6. REPORTS AND MODERATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              6. Reports and Moderation
            </h2>

            <p>
              Users may report incorrect route information, inaccurate fare
              information, inappropriate content, or user misconduct.
            </p>

            <p className="mt-2">
              Reports must be submitted honestly and in good faith. QRoute may
              use an AI-assisted mechanism to identify reports or accounts that
              require review. However, the final decision regarding warnings,
              content removal, account restriction, suspension, or shadowbanning
              will be made by the administrator.
            </p>

            <p className="mt-2">
              False or malicious reports may result in account restrictions.
            </p>
          </section>

          {/* 7. PROHIBITED ACTIVITIES */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              7. Prohibited Activities
            </h2>

            <p>Users must not:</p>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Submit false route or fare information.</li>
              <li>Submit false, repetitive, or malicious reports.</li>
              <li>
                Use offensive, threatening, discriminatory, or harmful
                language.
              </li>
              <li>
                Create multiple accounts to gain additional points or badges.
              </li>
              <li>Access another user’s account without permission.</li>
              <li>
                Attempt to damage, disrupt, hack, or overload the QRoute system.
              </li>
              <li>Use QRoute for illegal or unauthorized purposes.</li>
            </ul>
          </section>

          {/* 8. LIMITATION OF LIABILITY */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              8. Limitation of Liability
            </h2>

            <p>
              QRoute is a transportation-information platform and does not
              operate buses, jeepneys, trains, or other public utility
              vehicles.
            </p>

            <p className="mt-2">
              The QRoute team is not responsible for transportation delays,
              accidents, lost belongings, fare disputes, changes in routes,
              traffic conditions, service interruptions, or decisions made by
              transportation operators.
            </p>
          </section>

          {/* 9. CHANGES TO THE TERMS */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              9. Changes to the Terms
            </h2>

            <p>
              QRoute may update these Terms and Conditions when necessary.
              Continued use of the system after changes are posted means that
              the user accepts the updated terms.
            </p>
          </section>

          {/* 10. CONTACT INFORMATION */}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold text-black">
              10. Contact Information
            </h2>

            <p>
              For questions or concerns regarding these Terms and Conditions,
              users may contact:
            </p>

            <div className="mt-3 rounded-[5px] bg-[#f7f7f7] px-4 py-3">
              <p className="font-medium text-black">QRoute Administrator</p>
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

export default TermsAndCondition;