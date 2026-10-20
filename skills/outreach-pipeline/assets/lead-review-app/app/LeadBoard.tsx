"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Decision, DecisionRecord, Lead } from "@/lib/store";

const labels: Record<Decision, string> = { accept: "Accepted", reject: "Rejected", defer: "Deferred" };
const SWIPE_PX = 110;

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LeadBoard({
  batch,
  leads,
  initialDecisions,
}: {
  batch: string;
  leads: Lead[];
  initialDecisions: Record<string, DecisionRecord>;
}) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const [history, setHistory] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const queue = leads.filter((l) => !decisions[l.id]);
  const current = queue[0];
  const next = queue[1];
  const decided = leads.length - queue.length;

  async function post(leadId: string, decision: Decision | null, note = "") {
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId, decision, note }),
    });
    if (!res.ok) throw new Error(String(res.status));
    setDecisions(await res.json());
  }

  const decide = useCallback(
    (decision: Decision) => {
      if (!current || leaving) return;
      setError(null);
      setLeaving(decision);
      const note = notes[current.id] ?? "";
      // Let the fly-out animation play before the next card takes its place.
      setTimeout(async () => {
        try {
          await post(current.id, decision, note);
          setHistory((h) => [...h, current.id]);
        } catch {
          setError("Couldn't save that decision. Try again.");
        }
        setLeaving(null);
      }, 220);
    },
    [current, leaving, notes],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || leaving) return;
    try {
      await post(last, null);
      setHistory((h) => h.slice(0, -1));
    } catch {
      setError("Couldn't undo. Try again.");
    }
  }, [history, leaving]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // WASD, matching the swipe directions; arrow keys work the same way.
      const key = e.key.toLowerCase();
      if (key === "d" || key === "arrowright") decide("accept");
      else if (key === "a" || key === "arrowleft") decide("reject");
      else if (key === "w" || key === "arrowup") decide("defer");
      else if (key === "s" || key === "arrowdown") undo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo]);

  return (
    <main>
      <header className="top">
        <h1>
          <span className="wordmark" role="img" aria-label="Magical">
            <span aria-hidden="true">
              mag
              <span className="wordmark-i">
                ı
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="wordmark-hat" src="/hat.webp" alt="" />
              </span>
              cal
            </span>
          </span>
          <span className="title">Lead review</span>
        </h1>
        <p className="muted">
          {batch} · {decided} of {leads.length} decided
        </p>
        <div className="progress" aria-hidden>
          <div style={{ width: `${(decided / Math.max(leads.length, 1)) * 100}%` }} />
        </div>
        {error && <p className="error">{error}</p>}
      </header>

      {current ? (
        <>
          <div className="stage">
            {next && <LeadCard key={next.id} lead={next} behind />}
            <SwipeCard key={current.id} leaving={leaving} onSwipe={decide}>
              <LeadCard
                lead={current}
                note={notes[current.id] ?? ""}
                onNote={(v) => setNotes((n) => ({ ...n, [current.id]: v }))}
              />
            </SwipeCard>
          </div>

          <div className="controls">
            <button className="round reject" onClick={() => decide("reject")} title="Reject (A)">
              ✕<span>Reject <kbd>A</kbd></span>
            </button>
            <button className="round defer" onClick={() => decide("defer")} title="Defer (W)">
              ⏸<span>Defer <kbd>W</kbd></span>
            </button>
            <button className="round accept" onClick={() => decide("accept")} title="Accept (D)">
              ✓<span>Accept <kbd>D</kbd></span>
            </button>
          </div>
          <p className="hint">
            Swipe, or press <kbd>A</kbd> reject · <kbd>W</kbd> defer · <kbd>D</kbd> accept · <kbd>S</kbd> undo
            {history.length > 0 && (
              <>
                {" · "}
                <button className="link" onClick={undo}>
                  Undo last
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <Summary leads={leads} decisions={decisions} onReopen={(id) => post(id, null).catch(() => setError("Couldn't reopen."))} />
      )}
    </main>
  );
}

function SwipeCard({
  children,
  leaving,
  onSwipe,
}: {
  children: React.ReactNode;
  leaving: Decision | null;
  onSwipe: (d: Decision) => void;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);

  function down(e: React.PointerEvent) {
    // Links, the note box and buttons keep working normally.
    if ((e.target as HTMLElement).closest("a, textarea, button")) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  }
  function up() {
    if (!start.current) return;
    start.current = null;
    if (drag.x > SWIPE_PX) onSwipe("accept");
    else if (drag.x < -SWIPE_PX) onSwipe("reject");
    else if (drag.y < -SWIPE_PX) onSwipe("defer");
    else setDrag({ x: 0, y: 0 });
  }

  const fly = { accept: "translate(140%, 0) rotate(18deg)", reject: "translate(-140%, 0) rotate(-18deg)", defer: "translate(0, -140%)" };
  const transform = leaving ? fly[leaving] : `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`;
  const hint: Decision | null = leaving ?? (drag.x > 40 ? "accept" : drag.x < -40 ? "reject" : drag.y < -40 ? "defer" : null);
  const strength = leaving ? 1 : Math.min(1, Math.max(Math.abs(drag.x), -drag.y) / SWIPE_PX);

  return (
    <div
      className={`swipe ${start.current ? "dragging" : ""}`}
      style={{ transform }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {hint && (
        <div className={`stamp ${hint}`} style={{ opacity: strength }}>
          {labels[hint]}
        </div>
      )}
      {children}
    </div>
  );
}

function LeadCard({
  lead,
  behind,
  note,
  onNote,
}: {
  lead: Lead;
  behind?: boolean;
  note?: string;
  onNote?: (v: string) => void;
}) {
  const hasUncertainty = lead.uncertainty && !/^none/i.test(lead.uncertainty);
  return (
    <article className={`card ${behind ? "behind" : ""}`} aria-hidden={behind}>
      <span className="chip">{lead.segment || "unsegmented"}</span>
      <h2>{lead.name}</h2>
      <p className="headline">{lead.headline}</p>

      <dl>
        <dt>Contact</dt>
        <dd>
          {lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}
          {lead.email && lead.linkedin && " · "}
          {lead.linkedin && (
            <a href={lead.linkedin} target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          )}
          {!lead.email && !lead.linkedin && <span className="muted">No verified route</span>}
        </dd>
        {lead.fit && (
          <>
            <dt>Why they fit</dt>
            <dd>{lead.fit}</dd>
          </>
        )}
        {hasUncertainty && (
          <>
            <dt>Uncertainty</dt>
            <dd className="warn">{lead.uncertainty}</dd>
          </>
        )}
        {lead.sourceUrls.length > 0 && (
          <>
            <dt>Sources</dt>
            <dd className="sources">
              {lead.sourceUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  {host(u)}
                </a>
              ))}
            </dd>
          </>
        )}
      </dl>

      {!behind && (
        <textarea
          placeholder="Note (optional), e.g. why, or a personal touch to add"
          value={note}
          onChange={(e) => onNote?.(e.target.value)}
          rows={2}
        />
      )}
    </article>
  );
}

function Summary({
  leads,
  decisions,
  onReopen,
}: {
  leads: Lead[];
  decisions: Record<string, DecisionRecord>;
  onReopen: (id: string) => void;
}) {
  return (
    <section className="summary">
      <h2>All {leads.length} reviewed</h2>
      {(["accept", "defer", "reject"] as Decision[]).map((d) => {
        const group = leads.filter((l) => decisions[l.id]?.decision === d);
        if (!group.length) return null;
        return (
          <div key={d}>
            <h3>
              {labels[d]} ({group.length})
            </h3>
            <ul>
              {group.map((l) => (
                <li key={l.id}>
                  <span>
                    <strong>{l.name}</strong> <span className="muted">{l.headline.split("(")[0]}</span>
                    {decisions[l.id].note && <em> · “{decisions[l.id].note}”</em>}
                  </span>
                  <button className="link" onClick={() => onReopen(l.id)}>
                    Review again
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
