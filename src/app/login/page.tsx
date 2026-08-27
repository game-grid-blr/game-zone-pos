import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink dark:bg-[#101214] dark:text-white">
      <LoginForm />
    </main>
  );
}
