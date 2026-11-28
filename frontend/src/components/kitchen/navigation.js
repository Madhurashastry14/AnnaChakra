import {
  BarChart3,
  ClipboardList,
  HandHeart,
  LayoutDashboard,
  Scale,
  ScanLine,
  Settings,
  Trash2,
  TrendingUp,
  Truck,
} from "lucide-react";

export const KITCHEN_NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/kitchen/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/kitchen/forecast", label: "Plan a Meal", icon: TrendingUp },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/kitchen/meal-records", label: "Meal Records", icon: ClipboardList },
      { to: "/kitchen/scanner", label: "AI Food Scanner", icon: ScanLine },
      { to: "/kitchen/waste-logs", label: "Leftover Logs", icon: Trash2 },
      { to: "/kitchen/surplus", label: "Available Surplus", icon: HandHeart },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/kitchen/analytics", label: "Waste Intelligence", icon: BarChart3 },
      { to: "/kitchen/recommendations", label: "Portion Recommendations", icon: Scale },
    ],
  },
  {
    label: "Redistribution",
    items: [
      { to: "/kitchen/donations", label: "Donations", icon: HandHeart },
      { to: "/kitchen/delivery", label: "Delivery", icon: Truck },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/kitchen/settings", label: "Settings", icon: Settings }],
  },
];

const PAGE_RULES = [
  { test: (path) => path === "/kitchen/dashboard", section: "Workspace", title: "Overview" },
  { test: (path) => path === "/kitchen/forecast", section: "Workspace", title: "Plan a Meal" },
  { test: (path) => path === "/kitchen/forecasts", section: "Workspace", title: "Forecast History" },
  { test: (path) => /^\/kitchen\/forecasts\/\d+$/.test(path), section: "Workspace", title: "Forecast Detail" },
  { test: (path) => path === "/kitchen/meal-records", section: "Operations", title: "Meal Records" },
  { test: (path) => path === "/kitchen/meal-records/new", section: "Operations", title: "Record Meal Feedback" },
  { test: (path) => /^\/kitchen\/meal-records\/\d+$/.test(path), section: "Operations", title: "Meal Record Detail" },
  { test: (path) => path === "/kitchen/scanner", section: "Operations", title: "AI Food Scanner" },
  { test: (path) => path === "/kitchen/waste-logs", section: "Operations", title: "Leftover Logs" },
  { test: (path) => path === "/kitchen/surplus", section: "Operations", title: "Available Surplus" },
  { test: (path) => path === "/kitchen/matching", section: "Operations", title: "Find an NGO" },
  { test: (path) => path === "/kitchen/waste-logs/new", section: "Operations", title: "Log Leftovers" },
  { test: (path) => /^\/kitchen\/waste-logs\/\d+\/edit$/.test(path), section: "Operations", title: "Edit Leftover Log" },
  { test: (path) => /^\/kitchen\/waste-logs\/\d+$/.test(path), section: "Operations", title: "Leftover Log Detail" },
  { test: (path) => path === "/kitchen/analytics", section: "Insights", title: "Waste Intelligence" },
  { test: (path) => path === "/kitchen/recommendations", section: "Insights", title: "Portion Recommendations" },
  { test: (path) => path === "/kitchen/delivery", section: "Redistribution", title: "Delivery Personnel" },
  { test: (path) => path === "/kitchen/donations", section: "Redistribution", title: "Donations" },
  { test: (path) => path === "/kitchen/donations/new", section: "Redistribution", title: "Create Donation Offer" },
  { test: (path) => /^\/kitchen\/donations\/\d+$/.test(path), section: "Redistribution", title: "Donation Details" },
  { test: (path) => path === "/kitchen/settings", section: "Account", title: "Kitchen Settings" },
];

export function getPageMeta(pathname) {
  return PAGE_RULES.find((rule) => rule.test(pathname)) ?? { section: "Kitchen", title: "Kitchen Workspace" };
}

export function isNavActive(pathname, to) {
  if (to === "/kitchen/forecast" && /^\/kitchen\/forecasts(?:\/|$)/.test(pathname)) return true;
  if (to === "/kitchen/dashboard") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}
