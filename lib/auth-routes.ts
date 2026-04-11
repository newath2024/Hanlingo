export const SESSION_COOKIE_NAME = "hanlingo_session";

export function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/unit/") ||
    pathname.startsWith("/node/") ||
    pathname.startsWith("/lesson/") ||
    pathname === "/practice" ||
    pathname.startsWith("/practice/") ||
    pathname === "/analytics" ||
    pathname === "/leaderboard" ||
    pathname === "/profile"
  );
}

export function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/register";
}

export function isFocusedSessionPath(pathname: string) {
  return (
    pathname.startsWith("/node/") ||
    pathname.startsWith("/lesson/") ||
    pathname.startsWith("/practice/session") ||
    pathname.startsWith("/practice/mistakes") ||
    pathname.startsWith("/practice/errors")
  );
}

export function isShellPath(pathname: string) {
  return isProtectedPath(pathname) && !isAuthPage(pathname) && !isFocusedSessionPath(pathname);
}
