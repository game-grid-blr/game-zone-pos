import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { getSettings } from "@/lib/settings";

async function loginBusinessName() {
  try {
    return (await getSettings()).businessName;
  } catch {
    return undefined;
  }
}

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  const businessName = await loginBusinessName();

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink dark:bg-[#101214] dark:text-white">
      <LoginForm businessName={businessName} />
    </main>
  );
}
