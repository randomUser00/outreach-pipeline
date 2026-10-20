import LeadBoard from "./LeadBoard";
import { readDecisions, readLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ batch, leads }, decisions] = await Promise.all([readLeads(), readDecisions()]);
  return <LeadBoard batch={batch} leads={leads} initialDecisions={decisions} />;
}
