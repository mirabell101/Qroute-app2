import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Bus,
  Car,
  Home,
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

// ==================================================
// NAVIGATION
// ==================================================

const navItems = [
  {
    label: "Recents",
    icon: Home,
  },
  {
    label: "Saved",
    icon: MapPin,
  },
  {
    label: "Your Contribution",
    icon: Car,
  },
  {
    label: "Community",
    icon: MessageSquare,
  },
];

// ==================================================
// LANDING
// ==================================================

interface LandingProps {
  currentUserId: string | null;
  onLogout: () => void;
}

export default function Landing({
  currentUserId,
  onLogout,
}: LandingProps) {
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Shared map state (search, routes, trip selection, fares).
  const map = useTransitMap();

  const refreshPage = () => {
    window.location.reload();
  };

  const navigate = useNavigate();

  const handleClick = (name: string) => {
    // Community is accessible to both guests and logged-in users.
    if (name === "Community") {
      navigate("/community");
      return;
    }

    // These features require login for guests.
    if (
      !currentUserId &&
      (name === "Saved" ||
        name === "Your Contribution" ||
        name === "Notifications")
    ) {
      setShowLoginPrompt(true);
      return;
    }

    console.log(`${name} clicked`, {
      currentUserId,
    });
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-white">

      {/* ==================================================
          MAP
          ================================================== */}

      <TransitMapCanvas map={map} />

      {/* LOCATION + TERMINAL STATUS */}
      <TransitMapStatus
        map={map}
        terminalStatusClassName="absolute bottom-5 left-[230px] z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg sm:left-[240px] md:left-[250px]"
      />

      {/* ==================================================
          SIDEBAR
          ================================================== */}

      <aside
        className="
          absolute
          left-0
          top-0
          z-[2000]
          flex
          h-screen
          w-[220px]
          flex-col
          border-r
          border-white/10
          bg-[#0f2a47]
          text-white
          sm:w-[230px]
          md:w-[240px]
          lg:w-[250px]
        "
      >

        {/* ==================================================
            LOGO
            ================================================== */}

        <button
          type="button"
          onClick={refreshPage}
          title="Refresh"
          className="
            absolute
            flex
            items-center
            justify-center
            rounded-lg
            transition-colors
            duration-200
            hover:bg-white/10
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

        {/* ==================================================
            NAVIGATION
            ================================================== */}

        <nav
          className="
            absolute
            left-0
            top-[145px]
            flex
            w-full
            flex-col
            gap-1.5
            px-3
          "
        >
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleClick(item.label)}
                className="
                  group
                  flex
                  h-[46px]
                  w-full
                  items-center
                  rounded-xl
                  px-3
                  text-left
                  font-medium
                  text-white
                  transition-colors
                  duration-200
                  hover:bg-[#d0d5db]
                  hover:text-[#0f2a47]
                "
              >
                <span
                  className="
                    flex
                    w-[28px]
                    shrink-0
                    items-center
                    justify-center
                  "
                >
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="
                      transition-transform
                      duration-200
                      group-hover:scale-110
                    "
                  />
                </span>

                <span
                  className="
                    ml-2
                    whitespace-nowrap
                  "
                  style={{
                    fontSize: "16px",
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {!currentUserId && (
          <button
            type="button"
            onClick={() => {
              window.location.href = "/login";
            }}
            className="
              absolute
              bottom-[30px]
              left-1/2
              flex
              h-[40px]
              w-[160px]
              -translate-x-1/2
              items-center
              justify-center
              rounded-xl
              bg-[#d9dee3]
              text-[#0f2a47]
              font-semibold
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-white
            "
          >
            Sign In
          </button>
        )}

      </aside>

      {/* ==================================================
          HEADER
          ================================================== */}

      <header
        className="
          absolute
          left-[270px]
          top-[45px]
          z-[3000]
          flex
          items-center
          sm:left-[280px]
          md:left-[290px]
          lg:left-[300px]
        "
        style={{
          height: "45px",
        }}
      >

        {/* ==================================================
            SEARCH (shared)
            =================================================== */}

        <TransitMapSearch map={map} />

        {/* ==================================================
            VEHICLE FILTERS
            ================================================== */}

        <div
          className="
            ml-[8px]
            flex
            h-[52px]
            flex-nowrap
            items-center
            gap-[5px]
            sm:ml-[12px]
            sm:gap-[7px]
            lg:ml-[35px]
            lg:gap-[10px]
          "
        >

          {/* JEEP */}

          <button
            type="button"
            onClick={() => handleClick("Jeep")}
            className="
              group
              flex
              h-[52px]
              w-[52px]
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <Car
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>jeep</span>
          </button>

          {/* BUS */}

          <button
            type="button"
            onClick={() => handleClick("Bus")}
            className="
              group
              flex
              h-[52px]
              w-[52px]
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <Bus
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>bus</span>
          </button>

          {/* TRAIN */}

          <button
            type="button"
            onClick={() => handleClick("Train")}
            className="
              group
              flex
              h-[52px]
              w-[52px]
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <TrainFront
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>train</span>
          </button>

        </div>

        {/* ==================================================
            NOTIFICATION + PROFILE
            ================================================== */}

        <div
          className="
            relative
            ml-[300px]
            flex
            h-[55px]
            items-center
            gap-[20px]
          "
        >

          {/* NOTIFICATION */}

          <button
            type="button"
            onClick={() => handleClick("Notifications")}
            title="Notifications"
            className="
              group
              flex
              h-[45px]
              w-[45px]
              items-center
              justify-center
              rounded-full
              bg-white
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:scale-105
              hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:rotate-6
              "
            />
          </button>

          {/* PROFILE */}

          <button
            type="button"
            onClick={() => {
              setShowProfileMenu((previous) => !previous);
            }}
            title="Profile"
            className="
              group
              flex
              h-[45px]
              w-[45px]
              items-center
              justify-center
              rounded-full
              bg-white
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:scale-105
              hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <UserCircle
              size={21}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-105
              "
            />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              {!currentUserId ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    window.location.href = "/login";
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Log Out
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ==================================================
          PLACE DETAILS + ACTIVE ROUTE + FARES (shared)
          ================================================== */}

      <TransitMapPanel
        map={map}
        className="absolute left-[230px] top-[110px] z-[1500] max-h-[calc(100vh-130px)] w-[min(360px,calc(100vw-245px))] overflow-y-auto rounded-xl bg-white p-4 shadow-lg sm:left-[240px] md:left-[250px] lg:left-[300px]"
      />

      {showLoginPrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/30">
          <div className="w-[320px] rounded-xl bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            <h2 className="text-[18px] font-semibold text-gray-900">
              Sign in to access this
            </h2>

            <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
              Please log in or sign in to your QRoute account to access this
              feature.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="h-9 flex-1 rounded-[6px] border border-gray-300 bg-white text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLoginPrompt(false);
                  window.location.href = "/login";
                }}
                className="h-9 flex-1 rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white hover:bg-[#5547E8]"
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