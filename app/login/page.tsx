import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUserFromCookies } from "@/lib/server/auth";

export default async function LoginPage() {
  const user = await getCurrentUserFromCookies(await cookies());

  if (user) {
    redirect("/");
  }

  return <AuthForm mode="login" />;
}
