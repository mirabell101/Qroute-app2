
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Route,
  FileText,
  Flag,
  Users,
  Settings as SettingsIcon,
  MapPinned,
  Menu,
  X,
  UserRound,
  ShieldCheck,
  LockKeyhole,
  DatabaseBackup,
  Download,
  Upload,
  RotateCcw,
  Save,
  Monitor,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";

type Backup = {
  id: number;
  date: string;
  size: string;
};

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin/dashboard" },
  { label: "Route Management", icon: Route, path: "/admin/routes" },
  {
    label: "Post Management",
    icon: FileText,
    path: "/admin/post-management",
  },
  { label: "Reports", icon: Flag, path: "/admin/reports" },
  { label: "User Management", icon: Users, path: "/admin/users" },
  { label: "Settings", icon: SettingsIcon, path: "/admin/settings" },
];

const initialBackups: Backup[] = [
  { id: 1, date: "September 16, 2026", size: "2.4 MB" },
  { id: 2, date: "September 15, 2026", size: "2.3 MB" },
  { id: 3, date: "September 14, 2026", size: "2.2 MB" },
];

export default function Settings() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Admin account
  const [adminName, setAdminName] = useState("Admin");
  const [adminRole, setAdminRole] = useState("Administrator");

  // Password modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // Backup and restore
  const [backups, setBackups] = useState<Backup[]>(initialBackups);
  const [lastBackup, setLastBackup] = useState("September 16, 2026");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [notification, setNotification] = useState("");

  // Save changes
  const [saved, setSaved] = useState(false);

  function handleBackup() {
    const now = new Date();

    const formattedDate = now.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const newBackup: Backup = {
      id: Date.now(),
      date: formattedDate,
      size: "2.5 MB",
    };

    setBackups((current) => [newBackup, ...current]);
    setLastBackup(formattedDate);
    setNotification(
      "Backup preview created. Connect the backend to generate a real database backup.",
    );
  }

  function handleRestore() {
    if (!restoreTarget) return;

    setNotification(
      `Restore request for ${restoreTarget.date} confirmed. Backend integration is required to restore actual database records.`,
    );

    setRestoreTarget(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const validExtension = file.name.toLowerCase().endsWith(".sql");

    if (!validExtension) {
      setNotification("Please select a valid SQL backup file (.sql).");
      setSelectedFile(null);
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
    setNotification(`Selected backup file: ${file.name}`);
  }

  function handleUpload() {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }

    setNotification(
      `${selectedFile.name} is ready for upload. Connect the backend to import the backup into the database.`,
    );
  }

  function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMessage("Please complete all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }

    setPasswordMessage(
      "Password validation successful. Connect authentication backend to update the actual password.",
    );
  }

  function handleSaveChanges() {
    setSaved(true);

    window.setTimeout(() => {
      setSaved(false);
    }, 3000);
  }

  return (
    <div className="min-h-screen bg-[#F4F8FC] text-slate-800">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#102E4D] text-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <div>
            <h1 className="text-[32px] font-extrabold tracking-[-1.5px]">
              QRoute
            </h1>
            <p className="mt-0.5 text-xs tracking-wide text-blue-200">
              ADMINISTRATION
            </p>
          </div>
        </div>

        <div className="px-5 pt-8">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[2px] text-slate-400">
            Main Menu
          </p>

          <nav className="space-y-1.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Settings";

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setSidebarOpen(false);
                    navigate(item.path);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-5">
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200 text-[#102E4D]">
                <Users size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold">Admin Panel</p>
                <p className="text-xs text-slate-300">System management</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/admin")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-h-screen md:ml-[250px]">
        {/* Header */}
        <header className="sticky top-0 z-20 flex min-h-[86px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102E4D] text-white md:hidden"
            >
              <Menu size={21} />
            </button>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#102E4D] sm:text-2xl">
                Admin Settings
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                System Configuration & Preferences
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE9F7] font-bold text-[#102E4D]">
              A
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">Admin</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Breadcrumb */}
          <section className="mb-7">

            <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
              System Settings
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Manage your administrator account and system backups.
            </p>
          </section>

          {/* Settings content */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.35fr_0.9fr]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Admin account */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E4EFFB] text-[#102E4D]">
                    <UserRound size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">
                      Admin Account
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Manage your administrator profile.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#102E4D] text-[#102E4D]">
                        <UserRound size={30} />
                      </div>

                      <div>
                        <p className="font-semibold text-slate-800">
                          {adminName}
                        </p>
                        <p className="mt-1 text-xs text-[#5279A3]">
                          {adminRole}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordMessage("");
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setPasswordModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#102E4D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                      >
                        <LockKeyhole size={16} />
                        Change Password
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* System information */}
              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E4EFFB] text-[#102E4D]">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">
                      System Information
                    </h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Current QRoute system details.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl bg-[#F4F8FC] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-500">
                      Version
                    </span>
                    <span className="text-sm font-semibold text-[#102E4D]">
                      1.0.0
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-500">
                      Last Updated
                    </span>
                    <span className="text-sm font-semibold text-[#102E4D]">
                      September 15, 2026
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-500">
                      System Status
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      UI Preview
                    </span>
                  </div>
                </div>
              </section>

              {/* Save changes */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102E4D] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#19476D]"
                >
                  {saved ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <Save size={17} />
                  )}
                  {saved ? "Changes Saved" : "Save Changes"}
                </button>

                {saved && (
                  <span className="text-sm font-medium text-green-700">
                    Settings saved in this UI preview.
                  </span>
                )}
              </div>
            </div>

            {/* Right column: Backup and restore */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.035)] sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E4EFFB] text-[#102E4D]">
                  <DatabaseBackup size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">
                    Backup and Restore
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Manage your database backups.
                  </p>
                </div>
              </div>

              {/* Last backup */}
              <div className="rounded-xl bg-[#F4F8FC] p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Last backup:
                </p>
                <p className="mt-1 text-sm font-medium text-[#5279A3]">
                  {lastBackup}
                </p>

                <button
                  type="button"
                  onClick={handleBackup}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                >
                  <Download size={16} />
                  Back up now
                </button>
              </div>

              {/* Backup history */}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-slate-700">
                    Restore from previous backup
                  </h5>
                  <Clock size={16} className="text-slate-400" />
                </div>

                <div className="divide-y divide-slate-200">
                  {backups.map((backup) => (
                    <div
                      key={backup.id}
                      className="flex items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#102E4D]">
                          {backup.date}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {backup.size}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRestoreTarget(backup)}
                        className="shrink-0 rounded-lg border border-[#102E4D]/50 px-4 py-2 text-xs font-medium text-[#102E4D] transition hover:bg-[#102E4D] hover:text-white"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload backup */}
              <div className="mt-5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sql"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[110px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-center transition hover:border-[#102E4D] hover:bg-[#F4F8FC]"
                >
                  <Upload size={23} className="text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    {selectedFile
                      ? selectedFile.name
                      : "Upload backup file"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    SQL files only (.sql)
                  </span>
                </button>

                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleUpload}
                    className="mt-3 w-full rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                  >
                    <Upload size={15} className="mr-2 inline" />
                    Upload Backup
                  </button>
                )}
              </div>

              {/* Notification */}
              {notification && (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
                  <AlertCircle
                    size={17}
                    className="mt-0.5 shrink-0 text-blue-700"
                  />
                  <p className="text-xs leading-5 text-blue-800">
                    {notification}
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => setNotification("")}
                    className="ml-auto text-blue-500 hover:text-blue-800"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </section>
          </div>

          <footer className="pb-4 pt-8 text-center text-xs text-slate-400">
            QRoute Admin Settings · UI Preview
          </footer>
        </div>
      </main>

      {/* Change password modal */}
      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setPasswordModalOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="password-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  Change Password
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Update your administrator account password.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close"
                onClick={() => setPasswordModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePasswordChange} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="current-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Current Password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Enter current password"
                  className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter new password"
                    className="h-11 w-full rounded-lg border border-slate-200 px-4 pr-11 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    aria-label="Toggle password visibility"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Use at least 8 characters.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {passwordMessage && (
                <div className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-800">
                  {passwordMessage}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-[#102E4D] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D]"
                >
                  Update Password
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setRestoreTarget(null)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <RotateCcw size={23} />
            </div>

            <h3
              id="restore-title"
              className="mt-4 text-xl font-bold text-[#102E4D]"
            >
              Restore Backup?
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Are you sure you want to restore the backup from{" "}
              <strong>{restoreTarget.date}</strong>? Restoring an older backup
              may replace current database records.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRestoreTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleRestore}
                className="rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#19476D]"
              >
                Confirm Restore
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
