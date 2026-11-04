
import { ArrowLeft, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PointsBadges() {
  const navigate = useNavigate();

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
            Points and badges are not available yet.
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
                Not available yet
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Your Badges</h2>
          <p className="mt-4 text-sm text-gray-500">Not available yet</p>
        </section>
      </div>
    </main>
  );
}
