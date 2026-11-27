import {
  BarChart3,
  HandHeart,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

export const PORTAL_NAVIGATION = {
  NGO_MANAGER: [
    {
      label: "Workspace",
      items: [{ to: "/ngo/dashboard", label: "Overview", icon: LayoutDashboard }],
    },
    {
      label: "Operations",
      items: [
        { to: "/ngo/requirements", label: "Food Requirements", icon: PackageCheck },
        { to: "/ngo/donations", label: "Donation Offers", icon: HandHeart },
        { to: "/ngo/deliveries", label: "Incoming Deliveries", icon: Truck },
      ],
    },
    {
      label: "Insights",
      items: [{ to: "/ngo/analytics", label: "Impact Analytics", icon: BarChart3 }],
    },
    {
      label: "Account",
      items: [{ to: "/ngo/profile", label: "Organization Profile", icon: Settings }],
    },
  ],
  ADMIN: [
    {
      label: "Platform",
      items: [{ to: "/admin/dashboard", label: "Overview", icon: LayoutDashboard }],
    },
    {
      label: "Organizations",
      items: [
        { to: "/admin/kitchens", label: "Kitchen Management", icon: Users },
        { to: "/admin/ngos", label: "NGO Management", icon: HandHeart },
      ],
    },
    {
      label: "Redistribution",
      items: [
        { to: "/admin/donations", label: "Donations", icon: PackageCheck },
        { to: "/admin/deliveries", label: "Deliveries", icon: Truck },
      ],
    },
    {
      label: "Insights",
      items: [{ to: "/admin/analytics", label: "Platform Analytics", icon: ShieldCheck }],
    },
  ],
};

const PAGE_TITLES = {
  "/ngo/dashboard": ["Workspace", "Overview"],
  "/ngo/requirements": ["Operations", "Food Requirements"],
  "/ngo/requirements/new": ["Operations", "Create Requirement"],
  "/ngo/donations": ["Operations", "Donation Offers"],
  "/ngo/deliveries": ["Operations", "Incoming Deliveries"],
  "/ngo/analytics": ["Insights", "Impact Analytics"],
  "/ngo/profile": ["Account", "Organization Profile"],
  "/ngo/setup": ["Account", "Organization Setup"],
  "/admin/dashboard": ["Platform", "Overview"],
  "/admin/kitchens": ["Organizations", "Kitchen Management"],
  "/admin/ngos": ["Organizations", "NGO Management"],
  "/admin/donations": ["Redistribution", "Donation Monitoring"],
  "/admin/deliveries": ["Redistribution", "Delivery Monitoring"],
  "/admin/analytics": ["Insights", "Platform Analytics"],
};

export function getPortalPageMeta(pathname) {
  if (/^\/ngo\/requirements\/\d+\/edit$/.test(pathname)) {
    return { section: "Operations", title: "Edit Requirement" };
  }
  if (/^\/ngo\/donations\/\d+$/.test(pathname)) {
    return { section: "Operations", title: "Donation Details" };
  }
  const [section, title] = PAGE_TITLES[pathname] ?? ["Workspace", "Overview"];
  return { section, title };
}
