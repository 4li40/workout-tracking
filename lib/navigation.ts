export const PRIMARY_NAV_ITEMS = [
  { id: "workouts", label: "Workouts", href: "/workouts" },
  { id: "history", label: "History", href: "/history" },
  { id: "progress", label: "Progress", href: "/progress" },
  { id: "exercises", label: "Exercises", href: "/exercises" },
  { id: "settings", label: "Settings", href: "/settings" },
] as const;

export type NavItemId = (typeof PRIMARY_NAV_ITEMS)[number]["id"];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
