const adminNavigationDestinations: Record<string, string | null> = {
  Dashboard: "/admin/dashboard",
  "Route Management": "/admin/routes",
  "Post Management": "/admin/post-management",
  Reports: "/admin/reports",
  "User Management": "/admin/users",
  Settings: null,
  // The admin base map view lives at /admin/base. /admin itself now
  // redirects directly to /admin/dashboard.
  "Preview of the System": "/admin/base",
  "Switch to User Mode": "/home",
  Recents: "/recents",
  Saved: "/saved",
  "Your Contribution": "/contribution",
  Community: "/community",
  Profile: "/profile",
  Notifications: null,
  "Map filters": null,
};

export function getAdminNavigationDestination(
  label: string,
): string | null {
  return adminNavigationDestinations[label] ?? null;
}
