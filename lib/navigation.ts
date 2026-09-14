import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  FlaskConical,
  LayoutDashboard,
  Newspaper,
  NotebookPen,
  Settings,
  ShieldAlert,
  Target,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; phase: number };
export type NavGroup = { title: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    title: "Übersicht",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, phase: 3 },
      { href: "/plan", label: "Tagesplan", icon: CalendarCheck, phase: 5 },
      { href: "/news", label: "News & Kalender", icon: Newspaper, phase: 6 },
    ],
  },
  {
    title: "Trading",
    items: [
      { href: "/journal", label: "Journal", icon: NotebookPen, phase: 1 },
      { href: "/import", label: "Import", icon: Upload, phase: 2 },
      { href: "/stats", label: "Statistiken", icon: BarChart3, phase: 3 },
      { href: "/accounts", label: "Accounts", icon: Wallet, phase: 1 },
    ],
  },
  {
    title: "Wissen & Entwicklung",
    items: [
      { href: "/strategies", label: "Strategien & Wissen", icon: BookOpen, phase: 4 },
      { href: "/risk", label: "Risiko-Tools", icon: ShieldAlert, phase: 8 },
      { href: "/goals", label: "Ziele & Reviews", icon: Target, phase: 9 },
      { href: "/backtesting", label: "Backtesting", icon: FlaskConical, phase: 10 },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Einstellungen", icon: Settings, phase: 11 }],
  },
];

export const navItems = navGroups.flatMap((g) => g.items);
