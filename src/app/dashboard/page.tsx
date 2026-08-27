import { DashboardClient } from "@/components/DashboardClient";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  return <DashboardClient user={user} />;
}
