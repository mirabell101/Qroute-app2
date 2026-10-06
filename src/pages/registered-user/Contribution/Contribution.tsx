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
  {
    label: "Recents",
    icon: HomeIcon,
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

  const accounts = getStoredAccounts();

  const currentAccount = accounts.find(
    (account) => account.id === currentUserId
  );

  /*
   * Temporary empty contribution list.
   * We will connect this to the actual posts later.
   */
  const [contributions] = useState<Contribution[]>([]);

  const handleNavigation = (name: string) => {
    if (name === "Recents") {
      window.location.href = "/home";
      return;
    }

    console.log(`${name} clicked`, {
      currentUserId,
    });
  };

  const handleAddPost = () => {
    console.log("Add Post clicked", {
      currentUserId,
    });
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
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
          bg-[#12395A]
          text-white
          sm:w-[230px]
          md:w-[240px]
          lg:w-[250px]
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
            absolute
            flex
            items-center
            justify-center
            rounded-lg
            transition-colors
            duration-200
            hover:bg-[#1b4b6f]
          "
          style={{
            top: "30px",
            width: "100%",
            height: "75px",
          }}
        >
          <span
            className="
              font-bold
              tracking-[-2px]
              text-white
              text-[36px]
              sm:text-[40px]
              lg:text-[44px]
            "
            style={{
              lineHeight: "1",
            }}
          >
            Qroute
          </span>
        </button>

        {/* NAVIGATION */}
        <nav
          className="
            absolute
            left-1/2
            top-[145px]
            flex
            w-[calc(100%-32px)]
            -translate-x-1/2
            flex-col
            gap-[10px]
            px-0
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
                  group
                  flex
                  h-[46px]
                  w-full
                  items-center
                  rounded-lg
                  px-3
                  text-left
                  transition-all
                  duration-200
                  hover:translate-x-1
                  ${
                    isActive
                      ? "bg-[#1b4b6f]"
                      : "hover:bg-[#1b4b6f]"
                  }
                `}
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
                    font-medium
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
      </aside>

      {/* ==================================================
          HEADER
          ================================================== */}
      <header
        className="
  absolute
  left-[270px]
  right-[55px]
  top-[45px]
  z-[3000]
  flex
  h-[55px]
  items-start
  justify-between
  sm:left-[280px]
  md:left-[290px]
  lg:left-[300px]
"
      >
        {/* TITLE + SUBTITLE */}
        <div className="flex flex-col justify-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
            Your Contributions
          </h1>

          <p className="mt-1 text-[14px] text-gray-500">
            Manage your route contributions and published posts.
          </p>
        </div>

        {/* NOTIFICATION + PROFILE */}
        <div
          className="
            flex
            h-[55px]
            items-center
            gap-[20px]
            -translate-y-[5px]
          "
        >
          {/* NOTIFICATION */}
          <button
            type="button"
            onClick={() => {
              console.log("Notifications clicked", {
                currentUserId,
              });
            }}
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
                className="
                  transition-transform
                  duration-200
                  group-hover:scale-105
                "
              />
            )}
          </button>

          {/* PROFILE DROPDOWN */}
          {showProfileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  window.location.href = "/profile";
                }}
                className="
                  w-full
                  rounded-lg
                  px-3
                  py-2
                  text-left
                  text-[13px]
                  font-medium
                  text-gray-700
                  transition-colors
                  hover:bg-gray-100
                "
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
                className="
                  mt-1
                  w-full
                  rounded-lg
                  px-3
                  py-2
                  text-left
                  text-[13px]
                  font-medium
                  text-gray-700
                  transition-colors
                  hover:bg-gray-100
                "
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ==================================================
          MAIN CONTENT
          ================================================== */}
      <section
        className="
          absolute
          inset-0
          ml-[220px]
          overflow-y-auto
          sm:ml-[230px]
          md:ml-[240px]
          lg:ml-[250px]
        "
      >
        <div
          className="
            mx-auto
            w-full
            max-w-[900px]
            px-8
            pb-12
            pt-[135px]
          "
        >
          {/* TITLE SPACE */}
          <div className="h-[53px]" />

          {/* ==================================================
              ADD POST
              ================================================== */}
          <button
            type="button"
            onClick={handleAddPost}
            className="
              group
              mt-7
              flex
              w-full
              items-center
              gap-4
              rounded-xl
              border
              border-gray-200
              bg-white
              px-5
              py-4
              text-left
              shadow-[0_2px_8px_rgba(0,0,0,0.10)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-gray-50
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]
            "
          >
            <div
              className="
                flex
                h-[42px]
                w-[42px]
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-[#12395A]
                text-white
                transition-transform
                duration-200
                group-hover:scale-105
              "
            >
              <Plus
                size={21}
                strokeWidth={2.2}
              />
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

          {/* ==================================================
              CONTRIBUTIONS
              ================================================== */}
          <div className="mt-6">
            {contributions.length === 0 ? (
              <div
                className="
                  flex
                  min-h-[390px]
                  flex-col
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-gray-200
                  bg-white
                  px-6
                  text-center
                  shadow-[0_2px_8px_rgba(0,0,0,0.06)]
                "
              >
                <div
                  className="
                    flex
                    h-[58px]
                    w-[58px]
                    items-center
                    justify-center
                    rounded-full
                    bg-[#f1f3f5]
                  "
                >
                  <Car
                    size={27}
                    strokeWidth={1.8}
                    className="text-gray-400"
                  />
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
                {/* Contribution cards will be connected later. */}
                {contributions.map((contribution) => (
                  <div
                    key={contribution.id}
                    className="
                      rounded-xl
                      border
                      border-gray-200
                      bg-white
                      px-5
                      py-4
                      shadow-[0_2px_8px_rgba(0,0,0,0.06)]
                    "
                  >
                    <div className="grid grid-cols-[1fr_1.5fr_1fr] items-center gap-4">
                      <div>
                        <p className="text-[11px] text-gray-400">
                          DATE
                        </p>

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
                        <p className="text-[11px] text-gray-400">
                          STATUS
                        </p>

                        <p
                          className={`
                            mt-1
                            text-[13px]
                            font-semibold
                            ${
                              contribution.status === "Pending"
                                ? "text-[#D48A00]"
                                : "text-green-600"
                            }
                          `}
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
    </main>
  );
}