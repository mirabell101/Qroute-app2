import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { updateAccountDisplayName } from "@/lib/accountApi";

interface DisplayNameGAuthProps {
  userId: string;
}

export default function DisplayNameGAuth({
  userId,
}: DisplayNameGAuthProps) {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = displayName.trim();

    if (normalizedName.length < 2 || normalizedName.length > 50) {
      setError("Display Name must be between 2 and 50 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const savedName = await updateAccountDisplayName(
        userId,
        normalizedName,
      );

      if (!savedName) {
        throw new Error("Unable to verify the saved Display Name.");
      }

      navigate("/home", { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save your Display Name. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900">
          Complete Your Profile
        </h1>

        <p className="mt-3 text-sm text-gray-600">
          Before continuing to QRoute, please provide your Display Name.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700"
            >
              Display Name
            </label>

            <input
              id="displayName"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={50}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={loading}
              placeholder="Enter your Display Name"
              className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || displayName.trim().length < 2}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save and Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}