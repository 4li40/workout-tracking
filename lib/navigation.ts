export const PRIMARY_NAV_ITEMS = [
  { id: "workouts", label: "Workouts", href: "/workouts" },
  { id: "history", label: "History", href: "/history" },
  { id: "progress", label: "Progress", href: "/progression" },
  { id: "exercises", label: "Exercises", href: "/exercises" },
  { id: "settings", label: "Settings", href: "/settings" },
] as const;

export type NavItemId = (typeof PRIMARY_NAV_ITEMS)[number]["id"];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (
    href === "/workouts" &&
    (pathname === "/templates" || pathname.startsWith("/templates/"))
  ) {
    return true;
  }
  if (
    href === "/progression" &&
    (pathname === "/progress" || pathname.startsWith("/progress/"))
  ) {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
