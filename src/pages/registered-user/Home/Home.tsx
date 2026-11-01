import { useState } from "react";

import {
  Bell,
  Bus,
  Car,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  TrainFront,
  UserCircle,
} from "lucide-react";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import {
  TransitMapCanvas,
  TransitMapPanel,
  TransitMapSearch,
  TransitMapStatus,
  useTransitMap,
} from "@/components/transit-map";

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

interface HomeProps {
  currentUserId: string | null;
  onLogout: () => Promise<void>;
}

export default function Home({ currentUserId, onLogout }: HomeProps) {
  const map = useTransitMap();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleNavigation = (name: string) => {
    // Connect Recents, Saved, and vehicle filters later.
    void name;
    void currentUserId;
  };

  const handleGoHome = () => {
    window.location.href = "/home";
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await onLogout();
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-white">
      {/* MAP */}
      <TransitMapCanvas map={map} />

      {/* LOCATION + TERMINAL STATUS */}
      <TransitMapStatus
        map={map}
        terminalStatusClassName="absolute bottom-5 left-[230px] z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg sm:left-[240px] md:left-[250px]"
      />

      {/* SIDEBAR */}
      <aside
        className="
          absolute left-0 top-0 z-[2000]
          flex h-screen w-[220px] flex-col
          border-r border-white/10 bg-[#0f2a47] text-white
          sm:w-[230px] md:w-[240px] lg:w-[250px]
        "
      >
        <button
          type="button"
          onClick={handleGoHome}
          title="Home"
          className="
            absolute flex items-center justify-center rounded-lg
            transition-colors duration-200 hover:bg-white/10
          "
          style={{ top: "30px", width: "100%", height: "75px" }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <nav
          className="
            absolute left-0 top-[145px]
            flex w-full flex-col gap-1.5 px-3
          "
        >
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === "Your Contribution") {
                    window.location.href = "/contribution";
                    return;
                  }

                  if (item.label === "Community") {
                    window.location.href = "/community";
                    return;
                  }

                  handleNavigation(item.label);
                }}
                className="
                  group flex h-[46px] w-full items-center
                  rounded-xl px-3 text-left font-medium text-white
                  transition-colors duration-200
                  hover:bg-[#d0d5db] hover:text-[#0f2a47]
                "
              >
                <span className="flex w-[28px] shrink-0 items-center justify-center">
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="transition-transform duration-200 group-hover:scale-110"
                  />
                </span>

                <span
                  className="ml-2 whitespace-nowrap"
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
          absolute left-[270px] top-[45px] z-[3000]
          flex items-center
          sm:left-[280px] md:left-[290px] lg:left-[300px]
        "
        style={{ height: "45px" }}
      >
        {/* SEARCH */}
        <TransitMapSearch map={map} />

        {/* VEHICLE FILTERS */}
        <div
          className="
            ml-[8px] flex h-[52px] flex-nowrap items-center gap-[5px]
            sm:ml-[12px] sm:gap-[7px]
            lg:ml-[35px] lg:gap-[10px]
          "
        >
          <button
            type="button"
            onClick={() => handleNavigation("Jeep")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <Car size={18} strokeWidth={2} />
            <span>jeep</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigation("Bus")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <Bus size={18} strokeWidth={2} />
            <span>bus</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigation("Train")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <TrainFront size={18} strokeWidth={2} />
            <span>train</span>
          </button>
        </div>

        {/* NOTIFICATION + PROFILE */}
        <div className="relative ml-[300px] flex h-[55px] items-center gap-[20px]">
          <button
            type="button"
            onClick={() => handleNavigation("Notifications")}
            title="Notifications"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell size={20} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => setShowProfileMenu((previous) => !previous)}
            title="Profile"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <UserCircle size={21} strokeWidth={2} />
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

                  if (currentUserId) {
                    window.location.href = "/points-badges";
                  } else {
                    setShowSignInPrompt(true);
                  }
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Badges
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loggingOut ? "Logging out..." : "Log Out"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* PLACE DETAILS + ACTIVE ROUTE + FARES */}
      <TransitMapPanel
        map={map}
        className="absolute left-[230px] top-[110px] z-[1500] max-h-[calc(100vh-130px)] w-[min(360px,calc(100vw-245px))] overflow-y-auto rounded-xl bg-white p-4 shadow-lg sm:left-[240px] md:left-[250px] lg:left-[300px]"
        renderRouteActions={(route) =>
          currentUserId && route.created_by === currentUserId ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = `/contribution?route=${route.id}`;
              }}
              className="w-full rounded-full border border-gray-800 px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
            >
              Edit route
            </button>
          ) : null
        }
      />

      {/* SIGN-IN PROMPT */}
      {showSignInPrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Sign in required
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Please sign in to view your QPoints and badges.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignInPrompt(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSignInPrompt(false);
                  window.location.href = "/login";
                }}
                className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}