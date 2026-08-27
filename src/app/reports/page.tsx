import { ReportsPanel } from "@/components/ReportsPanel";
import { requireRole } from "@/lib/auth";

export default async function ReportsPage() {
  const user = await requireRole(["ADMIN"]);
  return <ReportsPanel user={user} />;
}
