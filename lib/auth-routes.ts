export const SESSION_COOKIE_NAME = "hanlingo_session";

export function isProtectedPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/unit/") ||
    pathname.startsWith("/node/") ||
    pathname.startsWith("/lesson/")
  );
}

export function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/register";
}
