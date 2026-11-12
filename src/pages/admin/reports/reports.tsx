import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import {
  getAdminReports,
  updateAdminReportStatus,
  type AdminReportRecord,
} from "@/lib/adminApi";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  Route as RouteIcon,
  FileText,
  Flag,
  Users,
  Settings,
  Search,
  MapPinned,
  Menu,
  X,
  ChevronDown,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  LogOut,
} from "lucide-react";

export type ReportType = "Post" | "User" | "Route" | "General";
export type ReportStatus = "Pending" | "Reviewed" | "Dismissed";

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

export default function Reports() {
  const navigate = useNavigate();
  const { userId } = useAccountProfile();

  const [reports, setReports] = useState<AdminReportRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedReport, setSelectedReport] = useState<AdminReportRecord | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("qroute_current_user");
    sessionStorage.removeItem("qroute_current_user");
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    let active = true;

    void getAdminReports(userId ?? "")
      .then((data) => {
        if (active) {
          setReports(data);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setReports([]);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load reports.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, retryCount]);

  const retryLoadingReports = () => {
    setReports([]);
    setErrorMessage(null);
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  const filteredReports = useMemo(() => {
    const search = searchTerm.toLowerCase().trim();

    return reports.filter((report) => {
      const matchesSearch = [
        report.reason,
        report.reportedContent,
        report.reporter,
        report.reportedUser,
        report.description,
        report.type,
      ].some((value) => value.toLowerCase().includes(search));

      const matchesType =
        typeFilter === "All" || report.type === typeFilter;

      const matchesStatus =
        statusFilter === "All" || report.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [reports, searchTerm, typeFilter, statusFilter]);

  const pendingCount = reports.filter(
    (report) => report.status === "Pending",
  ).length;

  async function handleUpdateReportStatus(id: number, status: ReportStatus) {
    if (!userId) {
      setUpdateError("Please sign in to continue.");
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);
    try {
      await updateAdminReportStatus(userId, id, status);
      setReports((currentReports) =>
        currentReports.map((report) =>
          report.id === id ? { ...report, status } : report,
        ),
      );
      setSelectedReport((currentReport) =>
        currentReport?.id === id
          ? { ...currentReport, status }
          : currentReport,
      );
    } catch (error: unknown) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : "Unable to update the report status.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  function openReportDetails(report: AdminReportRecord) {
    setSelectedReport(report);
    setUpdateError(null);
  }

  function closeReportDetails() {
    setSelectedReport(null);
    setUpdateError(null);
  }

  function getStatusStyle(status: ReportStatus) {
    switch (status) {
      case "Pending":
        return "bg-orange-50 text-orange-700";
      case "Reviewed":
        return "bg-green-50 text-green-700";
      case "Dismissed":
        return "bg-slate-100 text-slate-600";
    }
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

      {/* Sidebar: same design as the dashboard */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-[#102E4D] text-white transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[105px] items-center border-b border-white/10 px-7">
          <div>
            <img
              src="/White%20Qroute%20Logo.png"
              alt="QRoute Logo"
              className="h-auto w-[150px] object-contain"
            />
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
              const active = item.label === "Reports";
              const destination = getAdminNavigationDestination(item.label);

              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!destination}
                  title={
                    destination
                      ? undefined
                      : `${item.label} is unavailable in the current system.`
                  }
                  onClick={() => {
                    setSidebarOpen(false);
                    if (destination) navigate(destination);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
                    active
                      ? "bg-[#CFD5DB] font-semibold text-[#102E4D]"
                      : destination
                        ? "text-slate-200 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-slate-400"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {!destination && (
                    <span className="ml-auto text-[10px]">Unavailable</span>
                  )}

                  {destination && item.label === "Reports" && pendingCount > 0 && (
                    <span className="ml-auto rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
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
            onClick={() => navigate("/admin/base")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition hover:bg-white/10"
          >
            <MapPinned size={17} />
            Preview of the System
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main page */}
      <main className="min-h-screen md:ml-[250px]">
        {/* Header: same dimensions and style as the dashboard */}
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
                Reports
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                View and manage users&apos; reports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden h-9 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCE9F7] font-bold text-[#102E4D]">
                A
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-slate-800">Admin</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          {/* Page heading */}
          <section className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">
                Report Management
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Review reported posts and users in the QRoute community.
              </p>
            </div>

            <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Flag size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Pending Reports</p>
                <p className="text-xl font-bold text-[#102E4D]">
                  {pendingCount}
                </p>
              </div>
            </div>
          </section>

          {/* Search and status dropdown */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition focus-within:border-[#102E4D] focus-within:ring-2 focus-within:ring-blue-100">
              <Search size={18} className="shrink-0 text-slate-400" />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search user or content"
                aria-label="Search users or reported content"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />

              {searchTerm && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchTerm("")}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={17} />
                </button>
              )}
            </div>

            <div className="relative sm:w-[170px]">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter reports by status"
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm shadow-sm outline-none transition focus:border-[#102E4D] focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Dismissed">Dismissed</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
          </section>

          {/* Report type filters */}
          <section className="mb-7 flex flex-wrap gap-2.5">
            {["All", "Post", "User", "Route", "General"].map((type) => {
              const active = typeFilter === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`min-w-[70px] rounded-full border px-5 py-2.5 text-sm font-medium shadow-sm transition ${
                    active
                      ? "border-[#102E4D] bg-[#102E4D] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#102E4D] hover:text-[#102E4D]"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </section>

          {/* Reports table */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_14px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-1 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h4 className="font-bold text-slate-900">Reports</h4>
                <p className="mt-1 text-xs text-slate-500">
                  Review and manage community reports.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-500">
                {filteredReports.length}{" "}
                {filteredReports.length === 1 ? "report" : "reports"} found
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-sm">
                <thead className="bg-[#DFEAF4] text-xs text-slate-700">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Type</th>
                    <th className="px-4 py-4 font-semibold">Reason</th>
                    <th className="px-4 py-4 font-semibold">
                      Reported Content
                    </th>
                    <th className="px-4 py-4 font-semibold">Date</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 text-center font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredReports.map((report) => (
                    <tr
                      key={report.id}
                      className="transition hover:bg-[#F8FAFD]"
                    >
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            report.type === "Post"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {report.type}
                        </span>
                      </td>

                      <td className="max-w-[190px] px-4 py-4 font-medium text-slate-700">
                        {report.reason}
                      </td>

                      <td className="max-w-[230px] px-4 py-4">
                        <p
                          title={report.reportedContent}
                          className="truncate text-slate-600"
                        >
                          {report.reportedContent}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                        {report.date}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusStyle(report.status)}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              report.status === "Pending"
                                ? "bg-orange-500"
                                : report.status === "Reviewed"
                                  ? "bg-green-500"
                                  : "bg-slate-400"
                            }`}
                          />
                          {report.status}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => openReportDetails(report)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:border-[#102E4D] hover:bg-blue-50 hover:text-[#102E4D]"
                          >
                            <Eye size={14} />
                            Review
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredReports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Search size={22} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          {isLoading
                            ? "Loading reports..."
                            : errorMessage
                              ? "Reports could not be loaded"
                              : reports.length === 0
                                ? "No reports are available"
                                : "No reports found"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {errorMessage ??
                            (isLoading
                              ? "Loading report records from the server."
                              : reports.length === 0
                                ? "The reports service returned no reports."
                                : "Try another search term or change your filters.")}
                        </p>
                        {errorMessage ? (
                          <button
                            type="button"
                            onClick={retryLoadingReports}
                            className="mt-4 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            Retry
                          </button>
                        ) : (
                          (searchTerm ||
                            typeFilter !== "All" ||
                            statusFilter !== "All") && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchTerm("");
                                setTypeFilter("All");
                                setStatusFilter("All");
                              }}
                              className="mt-4 text-sm font-semibold text-[#102E4D] underline underline-offset-4"
                            >
                              Clear filters
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
              <p className="text-xs text-slate-400">
                QRoute Reports
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* Review report modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={closeReportDetails}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="report-modal-title"
                  className="text-xl font-bold text-[#102E4D]"
                >
                  Review Report
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review the details before deciding on the report.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close report details"
                onClick={closeReportDetails}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-4">
                <AlertTriangle size={22} className="shrink-0 text-orange-600" />
                <div>
                  <p className="font-semibold text-slate-800">
                    {selectedReport.reason}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Report type: {selectedReport.type}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Reported content
                </p>
                <p className="mt-1 font-semibold text-slate-800">
                  {selectedReport.reportedContent}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Reported user</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    @{selectedReport.reportedUser}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Reported by</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    @{selectedReport.reporter}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Date submitted</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    {selectedReport.date}
                  </p>
                </div>

                <div className="rounded-xl bg-[#F4F8FC] p-4">
                  <p className="text-xs text-slate-500">Current status</p>
                  <p className="mt-1 font-semibold text-[#102E4D]">
                    {selectedReport.status}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Report details
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {selectedReport.description}
                </p>
              </div>
            </div>

            {updateError && (
              <p
                role="alert"
                className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {updateError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeReportDetails}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>

              {selectedReport.status === "Pending" && (
                <>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => {
                      void handleUpdateReportStatus(selectedReport.id, "Dismissed");
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Dismiss
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => {
                      void handleUpdateReportStatus(selectedReport.id, "Reviewed");
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#102E4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#19476D] disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    Mark Reviewed
                  </button>
                </>
              )}

              {selectedReport.status !== "Pending" && (
                <div className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600">
                  {selectedReport.status === "Reviewed" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <Clock size={16} />
                  )}
                  {selectedReport.status}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
