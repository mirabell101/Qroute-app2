import {
  LayoutDashboard, Receipt, Route as RouteIcon, FileText, Flag, Users, Settings,
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Route Management", icon: RouteIcon },
  { label: "Fare Management", icon: Receipt },
  { label: "Post Management", icon: FileText },
  { label: "Reports", icon: Flag },
  { label: "User Management", icon: Users },
  { label: "Settings", icon: Settings },
];

export const ROUTES_PER_PAGE = 10;

export const TABS = [
  "All",
  "Stops",
  "Routes",
  "Terminals",
  "Transport Types",
] as const;

export const STATUSES = [
  "All current records",
  "Pending",
  "Approved",
  "Rejected",
  "Inactive",
  "Banned",
  "Archived",
];
