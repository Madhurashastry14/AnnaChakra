import {
  BarChart3,
  ClipboardList,
  HandHeart,
  History,
  LayoutDashboard,
  Scale,
  ScanLine,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  Truck,
} from "lucide-react";

export const KITCHEN_NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { to: "/kitchen/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/kitchen/menu-planner", label: "Smart Menu Planner", icon: Sparkles },
      { to: "/kitchen/forecast", label: "Demand Forecast", icon: TrendingUp },
      { to: "/kitchen/forecasts", label: "Forecast History", icon: History },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/kitchen/meal-records", label: "Meal Records", icon: ClipboardList },
      { to: "/kitchen/scanner", label: "AI Food Scanner", icon: ScanLine },
      { to: "/kitchen/waste-logs", label: "Waste Logs", icon: Trash2 },
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
  { test: (path) => path === "/kitchen/menu-planner", section: "Workspace", title: "Smart Menu Planner" },
  { test: (path) => path === "/kitchen/forecast", section: "Workspace", title: "Demand Forecast" },
  { test: (path) => path === "/kitchen/forecasts", section: "Workspace", title: "Forecast History" },
  { test: (path) => /^\/kitchen\/forecasts\/\d+$/.test(path), section: "Workspace", title: "Forecast Detail" },
  { test: (path) => path === "/kitchen/meal-records", section: "Operations", title: "Meal Records" },
  { test: (path) => path === "/kitchen/meal-records/new", section: "Operations", title: "Record Meal Feedback" },
  { test: (path) => /^\/kitchen\/meal-records\/\d+$/.test(path), section: "Operations", title: "Meal Record Detail" },
  { test: (path) => path === "/kitchen/scanner", section: "Operations", title: "AI Food Scanner" },
  { test: (path) => path === "/kitchen/waste-logs", section: "Operations", title: "Waste Logs" },
  { test: (path) => path === "/kitchen/waste-logs/new", section: "Operations", title: "Log Waste" },
  { test: (path) => /^\/kitchen\/waste-logs\/\d+\/edit$/.test(path), section: "Operations", title: "Edit Waste Log" },
  { test: (path) => /^\/kitchen\/waste-logs\/\d+$/.test(path), section: "Operations", title: "Waste Log Detail" },
  { test: (path) => path === "/kitchen/analytics", section: "Insights", title: "Waste Intelligence" },
  { test: (path) => path === "/kitchen/recommendations", section: "Insights", title: "Portion Recommendations" },
  { test: (path) => path === "/kitchen/delivery", section: "Redistribution", title: "Delivery Personnel" },
  { test: (path) => path === "/kitchen/donations", section: "Redistribution", title: "Donations" },
  { test: (path) => path === "/kitchen/settings", section: "Account", title: "Kitchen Settings" },
];

export function getPageMeta(pathname) {
  return PAGE_RULES.find((rule) => rule.test(pathname)) ?? { section: "Kitchen", title: "Kitchen Workspace" };
}

export function isNavActive(pathname, to) {
  if (to === "/kitchen/dashboard") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}
