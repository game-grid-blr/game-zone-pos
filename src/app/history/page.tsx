import { TransactionTable } from "@/components/TransactionTable";
import { requireUser } from "@/lib/auth";

export default async function HistoryPage() {
  const user = await requireUser();
  return <TransactionTable user={user} />;
}
