import { promises as fs } from "fs";
import path from "path";

export type Decision = "accept" | "reject" | "defer";

export type Lead = {
  id: string;
  name: string;
  headline: string;
  segment: string;
  email: string | null;
  linkedin: string | null;
  contact?: string;
  fit?: string;
  uncertainty?: string;
  sourceUrls: string[];
};

export type DecisionRecord = { decision: Decision; note: string; decidedAt: string };

const dataDir = path.join(process.cwd(), "data");
const decisionsPath = path.join(dataDir, "decisions.json");
const logPath = path.join(dataDir, "decisions-log.jsonl");

export async function readLeads(): Promise<{ batch: string; leads: Lead[] }> {
  return JSON.parse(await fs.readFile(path.join(dataDir, "leads.json"), "utf8"));
}

export async function readDecisions(): Promise<Record<string, DecisionRecord>> {
  try {
    return JSON.parse(await fs.readFile(decisionsPath, "utf8"));
  } catch {
    return {};
  }
}

// Writes are serialized so two quick clicks can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();

export function saveDecision(leadId: string, record: DecisionRecord | null) {
  const run = queue.then(async () => {
    const all = await readDecisions();
    if (record) all[leadId] = record;
    else delete all[leadId];
    const tmp = decisionsPath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(all, null, 2));
    await fs.rename(tmp, decisionsPath);
    // Append-only history: the coordinator relays these to the CRM writer.
    const entry = { leadId, ...(record ?? { decision: "cleared", decidedAt: new Date().toISOString() }) };
    await fs.appendFile(logPath, JSON.stringify(entry) + "\n");
    return all;
  });
  queue = run.catch(() => undefined);
  return run;
}
