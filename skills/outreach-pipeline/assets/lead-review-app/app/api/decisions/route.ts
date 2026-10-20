import { NextResponse } from "next/server";
import { readDecisions, readLeads, saveDecision, type Decision } from "@/lib/store";

const allowed: Decision[] = ["accept", "reject", "defer"];

export async function GET() {
  return NextResponse.json(await readDecisions());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId : "";
  const { leads } = await readLeads();
  if (!leads.some((l) => l.id === leadId)) {
    return NextResponse.json({ error: "unknown lead" }, { status: 400 });
  }
  if (body.decision === null) {
    return NextResponse.json(await saveDecision(leadId, null));
  }
  if (!allowed.includes(body.decision)) {
    return NextResponse.json({ error: "bad decision" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : "";
  return NextResponse.json(
    await saveDecision(leadId, { decision: body.decision, note, decidedAt: new Date().toISOString() }),
  );
}
