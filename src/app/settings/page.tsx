import { SettingsPanel } from "@/components/SettingsPanel";
import { requireRole } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireRole(["ADMIN"]);
  return <SettingsPanel user={user} />;
}
