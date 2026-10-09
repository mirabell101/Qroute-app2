
import { useState } from "react";

import {
  Bell,
  Car,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  UserCircle,
  Plus,
} from "lucide-react";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

interface ContributionsProps {
  currentUserId: string;
  onLogout: () => void;
}

interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
  profilePicture?: string | null;
}

interface Contribution {
  id: string;
  date: string;
  terminal: string;
  status: "Pending" | "Published";
}

const ACCOUNTS_KEY = "qroute_accounts";

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

function getStoredAccounts(): Account[] {
  try {
    const stored = localStorage.getItem(ACCOUNTS_KEY);
    return stored ? (JSON.parse(stored) as Account[]) : [];
  } catch {
    return [];
  }
}

export default function Contributions({
  currentUserId,
  onLogout,
}: ContributionsProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showAddPostModal, setShowAddPostModal] = useState(false);

  const [caption, setCaption] = useState("");
  const [terminal, setTerminal] = useState("");
  const [pointA, setPointA] = useState("");
  const [pointB, setPointB] = useState("");
  const [vehicle, setVehicle] = useState("Bus");
  const [commuterType, setCommuterType] = useState("");
  const [fare, setFare] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  

  const accounts = getStoredAccounts();

  const currentAccount = accounts.find(
    (account) => account.id === currentUserId
  );

  // Temporary empty contribution list.
  // This will be connected to the actual posts later.
  const [contributions] = useState<Contribution[]>([]);

  const handleNavigation = (name: string) => {
    if (name === "Recents") {
      window.location.href = "/home";
      return;
    }

    console.log(`${name} clicked`, { currentUserId });
  };

  const handleSubmitPost = () => {
    if (!photoName) {
  alert("Please upload a photo.");
  return;
}
if (!caption.trim()) {
  alert("Please enter a caption.");
  return;
}
if (!vehicle.trim()) {
  alert("Please select a type of vehicle.");
  return;
}
if (!commuterType.trim()) {
  alert("Please select a type of commuter.");
  return;
}
if (!fare.trim() || !/^\d+$/.test(fare)) {
  alert("Please enter a valid fare using whole numbers only.");
  return;
}
    // UI only for now; connect this to post storage later.
    console.log("Post form submitted", {
      currentUserId,
      caption,
      terminal,
      origin: pointA,
      destination: pointB,
      vehicle,
      commuterType,
      fare,
      photoName,
    });

    setShowAddPostModal(false);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
      {/* SIDEBAR */}
      <aside
        className="
          absolute left-0 top-0 z-[2000]
          flex h-screen w-[220px] flex-col
          bg-[#12395A] text-white
          sm:w-[230px] md:w-[240px] lg:w-[250px]
        "
      >
        {/* LOGO / HOME */}
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home";
          }}
          title="Home"
          className="
            absolute flex items-center justify-center
            rounded-lg transition-colors duration-200
            hover:bg-[#1b4b6f]
          "
          style={{
            top: "30px",
            width: "100%",
            height: "75px",
          }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        {/* NAVIGATION */}
        <nav
          className="
            absolute left-0 top-[145px]
            flex w-full flex-col gap-0
          "
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === "Your Contribution";

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNavigation(item.label)}
                className={`
                  group flex h-[46px] w-full items-center
                  px-6 text-left transition-colors duration-200
                  ${
                    isActive
                      ? "bg-[#1b4b6f]"
                      : "hover:bg-[#d9dee3] hover:text-[#12395A]"
                  }
                `}
              >
                <span className="flex w-[28px] shrink-0 items-center justify-center">
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="transition-transform duration-200 group-hover:scale-110"
                  />
                </span>

                <span
                  className="ml-2 whitespace-nowrap font-medium"
                  style={{ fontSize: "16px" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* HEADER */}
      <header
        className="
          absolute left-[270px] right-[55px] top-[45px] z-[3000]
          flex h-[55px] items-start justify-between
          sm:left-[280px] md:left-[290px] lg:left-[300px]
        "
      >
        <div className="flex flex-col justify-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
            Your Contributions
          </h1>

          <p className="mt-1 text-[14px] text-gray-500">
            Manage your route contributions and published posts.
          </p>
        </div>

        {/* NOTIFICATION + PROFILE */}
        <div className="flex h-[55px] -translate-y-[5px] items-center gap-[20px]">
          <button
            type="button"
            onClick={() => {
              console.log("Notifications clicked", { currentUserId });
            }}
            title="Notifications"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-6"
            />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowProfileMenu((previous) => !previous);
            }}
            title="Profile"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            {currentAccount?.profilePicture ? (
              <img
                src={currentAccount.profilePicture}
                alt="Profile"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <UserCircle
                size={21}
                strokeWidth={2}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            )}
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  window.location.href = "/profile";
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Account
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout();
                  window.location.href = "/";
                }}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <section
        className={`
          absolute inset-0 ml-[220px]
          ${contributions.length > 0 ? "overflow-y-auto" : "overflow-y-hidden"}
          sm:ml-[230px] md:ml-[240px] lg:ml-[250px]
        `}
      >
        <div className="mx-auto w-full max-w-[900px] px-8 pb-12 pt-[105px]">
  {/* TITLE SPACE */}
  <div className="h-[23px]" />
          {/* ADD POST BUTTON */}
          <button
            type="button"
            onClick={() => setShowAddPostModal(true)}
            className="
              group mt-7 flex w-full items-center gap-4 rounded-xl
              border border-gray-200 bg-white px-5 py-4 text-left
              shadow-[0_2px_8px_rgba(0,0,0,0.10)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]
            "
          >
            <div
              className="
                flex h-[42px] w-[42px] shrink-0 items-center justify-center
                rounded-full bg-[#12395A] text-white transition-transform
                duration-200 group-hover:scale-105
              "
            >
              <Plus size={21} strokeWidth={2.2} />
            </div>

            <div>
              <p className="text-[15px] font-semibold text-gray-900">
                Add Post
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Share a route contribution with the community
              </p>
            </div>
          </button>

          {/* CONTRIBUTIONS */}
          <div className="mt-6">
            {contributions.length === 0 ? (
              <div
                className="
                  flex min-h-[390px] flex-col items-center justify-center
                  rounded-xl border border-gray-200 bg-white px-6 text-center
                  shadow-[0_2px_8px_rgba(0,0,0,0.06)]
                "
              >
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f1f3f5]">
                  <Car size={27} strokeWidth={1.8} className="text-gray-400" />
                </div>

                <h2 className="mt-5 text-[17px] font-semibold text-gray-800">
                  Nothing to see here yet.
                </h2>

                <p className="mt-2 max-w-[380px] text-[13px] leading-[1.6] text-gray-500">
                  Add a post to share your route contribution with the
                  community.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {contributions.map((contribution) => (
                  <div
                    key={contribution.id}
                    className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                  >
                    <div className="grid grid-cols-[1fr_1.5fr_1fr] items-center gap-4">
                      <div>
                        <p className="text-[11px] text-gray-400">DATE</p>
                        <p className="mt-1 text-[13px] font-medium text-gray-800">
                          {contribution.date}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-gray-400">
                          TERMINAL / ROUTE
                        </p>
                        <p className="mt-1 text-[13px] font-medium text-gray-800">
                          {contribution.terminal}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] text-gray-400">STATUS</p>
                        <p
                          className={`mt-1 text-[13px] font-semibold ${
                            contribution.status === "Pending"
                              ? "text-[#D48A00]"
                              : "text-green-600"
                          }`}
                        >
                          {contribution.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ADD POST MODAL */}
      {showAddPostModal && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 px-4 py-6"
          onClick={() => setShowAddPostModal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-post-title"
            className="max-h-[90vh] w-full max-w-[620px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="add-post-title"
                  className="text-xl font-semibold text-gray-900"
                >
                  Create a Contribution
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Share useful route details with the QRoute community.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowAddPostModal(false)}
                className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* PHOTO */}
              <div>
                <label
                  htmlFor="post-photo"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Photo <span className="text-red-500">*</span>
                </label>

                <label
                  htmlFor="post-photo"
                  className="flex min-h-[92px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center transition-colors hover:border-[#12395A] hover:bg-gray-100"
                >
                  <span className="text-sm font-medium text-gray-700">
                    {photoName || "Choose a photo to upload"}
                  </span>
                  <span className="mt-1 text-xs text-gray-500">
                    PNG, JPG, or JPEG
                  </span>
                </label>

                <input
                  id="post-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => {
  const file = e.target.files?.[0] ?? null;
  setPhotoFile(file);
  setPhotoName(file?.name ?? "");
}}
                />
              </div>

              {/* CAPTION */}
              <div>
                <label
                  htmlFor="post-caption"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Caption <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="post-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Share your route experience..."
                  rows={2}
                  className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                />
              </div>

              {/* TERMINAL */}
              <div>
                <label
                  htmlFor="post-terminal"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Terminal
                </label>
                <input
                  id="post-terminal"
                  value={terminal}
                  onChange={(event) => setTerminal(event.target.value)}
                  placeholder="Enter terminal name"
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                />
              </div>

              {/* ROUTE */}
              <div>
                <p className="mb-1.5 block text-sm font-medium text-gray-700">
                  Route details
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="post-point-a"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point A / Origin
                    </label>
                    <input
                      id="post-point-a"
                      value={pointA}
                      onChange={(event) => setPointA(event.target.value)}
                      placeholder="Starting point"
                      className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="post-point-b"
                      className="mb-1 block text-xs text-gray-500"
                    >
                      Point B / Destination
                    </label>
                    <input
                      id="post-point-b"
                      value={pointB}
                      onChange={(event) => setPointB(event.target.value)}
                      placeholder="Destination"
                      className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                    />
                  </div>
                </div>
              </div>

              {/* VEHICLE, COMMUTER, FARE */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="post-vehicle"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Type of vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="post-vehicle"
                    value={vehicle}
                    onChange={(event) => setVehicle(event.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                  >
                    <option>Bus</option>
                    <option>Jeepney</option>
                    <option>Train</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="post-commuter"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Type of commuter <span className="text-red-500">*</span>
                  </label>
                  <select
  id="post-commuter-type"
  value={commuterType}
  onChange={(e) => setCommuterType(e.target.value)}
  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
>
  <option value="Regular">Regular</option>
  <option value="Discounted">Discounted</option>
</select>
                </div>

                <div>
                  <label
                    htmlFor="post-fare"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Fare (₱) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="post-fare"
                    type="text"
inputMode="numeric"
value={fare}
onChange={(e) => {
  const value = e.target.value;
  if (/^\d*$/.test(value)) {
    setFare(value);
  }
}}
                    placeholder="0.00"
                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-[#12395A] focus:ring-1 focus:ring-[#12395A]"
                  />
                </div>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAddPostModal(false)}
                className="h-10 rounded-lg border border-gray-300 px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitPost}
                className="h-10 rounded-lg bg-[#12395A] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f]"
              >
                Add Post
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}