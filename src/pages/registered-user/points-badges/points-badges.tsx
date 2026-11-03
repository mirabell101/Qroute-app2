
import { useEffect, useState } from "react";
import { Award, ArrowLeft, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PointsBadgesProps {
  currentUserId: string;
  onLogout: () => void;
}

interface SubmittedContribution {
  id: string;
  userId: string;
  status: "Pending" | "Approved" | "Needs Revision";
}

const SUBMITTED_KEY = "qroute_submitted_contributions";

const BADGES = [
  { name: "First Contributor", required: 1, description: "Approve your first contribution." },
  { name: "Route Explorer", required: 5, description: "Reach 5 approved contributions." },
  { name: "Fare Guide", required: 10, description: "Reach 10 approved contributions." },
  { name: "Commuter Champion", required: 25, description: "Reach 25 approved contributions." },
  { name: "QRoute Legend", required: 50, description: "Reach 50 approved contributions." },
];

export default function PointsBadges({
  currentUserId,
}: PointsBadgesProps) {
  const navigate = useNavigate();
  const [approvedCount, setApprovedCount] = useState(0);

  useEffect(() => {
    const loadApprovedContributions = () => {
      try {
        const stored = localStorage.getItem(SUBMITTED_KEY);
        const contributions: SubmittedContribution[] = stored
          ? JSON.parse(stored)
          : [];

        const count = contributions.filter(
          (post) =>
            post.userId === currentUserId &&
            post.status === "Approved",
        ).length;

        setApprovedCount(count);
      } catch {
        setApprovedCount(0);
      }
    };

    loadApprovedContributions();

    window.addEventListener("storage", loadApprovedContributions);
    return () => window.removeEventListener("storage", loadApprovedContributions);
  }, [currentUserId]);

  const totalPoints =
    approvedCount > 0 ? 75 + (approvedCount - 1) * 50 : 0;

  const earnedBadges = BADGES.filter(
    (badge) => approvedCount >= badge.required,
  );

  const nextBadge = BADGES.find(
    (badge) => approvedCount < badge.required,
  );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[#6355F5]"
        >
          <ArrowLeft size={18} />
          Back to Account
        </button>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Points and Badges
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Earn QPoints and badges by contributing helpful commuter information.
          </p>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0edff] text-[#6355F5]">
              <Coins size={30} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">
                Your QPoints
              </p>
              <p className="text-3xl font-bold text-[#6355F5]">
                {totalPoints.toLocaleString()}
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            First approved contribution: 75 QPoints. Each additional approved
            contribution: 50 QPoints.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Approved contributions: {approvedCount}
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Your Badges
            </h2>
            <span className="text-sm text-gray-500">
              {earnedBadges.length} / {BADGES.length} earned
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {BADGES.map((badge) => {
              const earned = approvedCount >= badge.required;

              return (
                <article
                  key={badge.name}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${
                    earned
                      ? "border-[#dcd6ff] bg-[#faf9ff]"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                      earned
                        ? "bg-[#ece8ff] text-[#6355F5]"
                        : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    <Award size={24} />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {badge.name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {badge.description}
                    </p>
                    <p
                      className={`mt-2 text-xs font-medium ${
                        earned ? "text-[#6355F5]" : "text-gray-400"
                      }`}
                    >
                      {earned ? "Badge earned" : `${badge.required} approved contributions needed`}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {nextBadge && (
            <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              Next badge: <strong>{nextBadge.name}</strong> —{" "}
              {nextBadge.required - approvedCount} more approved contribution(s).
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
