"use client";
import { useState } from "react";
import { Mail, Phone, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Interaction, Contact, PortfolioValueAdd } from "@/lib/types";

interface BoardMember {
  name: string;
  role: string;
}

interface Props {
  companyId: string;
  interactions: Interaction[];
  contacts: Contact[];
  valueAdd: PortfolioValueAdd[];
  onDetailRefresh: () => void;
}

const TYPE_ICON_BG: Record<string, string> = {
  meeting: "bg-blue-100 text-blue-600",
  call:    "bg-emerald-100 text-emerald-600",
  email:   "bg-slate-100 text-slate-500",
  note:    "bg-amber-100 text-amber-600",
  intro:   "bg-violet-100 text-violet-600",
  event:   "bg-pink-100 text-pink-600",
};

const VALUE_ADD_CATEGORIES = [
  "intro",
  "hiring",
  "bd_lead",
  "investor_intro",
  "pr",
  "ops_support",
  "other",
];

const CATEGORY_LABEL: Record<string, string> = {
  intro:           "Intro",
  hiring:          "Hiring",
  bd_lead:         "BD lead",
  investor_intro:  "Investor intro",
  pr:              "PR",
  ops_support:     "Ops support",
  other:           "Other",
};

const CATEGORY_BADGE: Record<string, string> = {
  intro:           "bg-violet-100 text-violet-700",
  hiring:          "bg-blue-100 text-blue-700",
  bd_lead:         "bg-emerald-100 text-emerald-700",
  investor_intro:  "bg-purple-100 text-purple-700",
  pr:              "bg-pink-100 text-pink-700",
  ops_support:     "bg-amber-100 text-amber-700",
  other:           "bg-slate-100 text-slate-500",
};

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PortfolioRelationshipsTab({ companyId, interactions, contacts, valueAdd, onDetailRefresh }: Props) {
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [addingBoard, setAddingBoard] = useState(false);
  const [boardForm, setBoardForm] = useState({ name: "", role: "Board member" });

  const [addingValueAdd, setAddingValueAdd] = useState(false);
  const [vaForm, setVaForm] = useState({ description: "", category: "intro" });
  const [savingVa, setSavingVa] = useState(false);

  function handleAddBoard() {
    if (!boardForm.name.trim()) return;
    setBoardMembers(prev => [...prev, { name: boardForm.name.trim(), role: boardForm.role }]);
    setBoardForm({ name: "", role: "Board member" });
    setAddingBoard(false);
  }

  async function handleAddValueAdd() {
    if (!vaForm.description.trim()) return;
    setSavingVa(true);
    const supabase = createClient();
    await supabase.from("portfolio_value_add").insert({
      company_id: companyId,
      description: vaForm.description.trim(),
      category: vaForm.category,
    });
    setVaForm({ description: "", category: "intro" });
    setAddingValueAdd(false);
    setSavingVa(false);
    onDetailRefresh();
  }

  async function handleDeleteValueAdd(id: string) {
    const supabase = createClient();
    await supabase.from("portfolio_value_add").delete().eq("id", id);
    onDetailRefresh();
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Key contacts — now first */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Key contacts</h3>
        {contacts.length === 0 ? (
          <p className="text-xs text-slate-400">No contacts linked to this company.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {contacts.map(c => (
              <div key={c.id} className="bg-slate-50 rounded-lg p-3">
                <p className="text-[13px] font-semibold text-slate-800">{c.first_name} {c.last_name}</p>
                {c.title && <p className="text-[11px] text-slate-500 mt-0.5">{c.title}</p>}
                <div className="flex flex-col gap-0.5 mt-1.5">
                  {c.email && (
                    <div className="flex items-center gap-1">
                      <Mail size={10} className="text-slate-400" />
                      <a href={`mailto:${c.email}`} className="text-[11px] text-blue-600 hover:underline truncate">{c.email}</a>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-1">
                      <Phone size={10} className="text-slate-400" />
                      <span className="text-[11px] text-slate-600">{c.phone}</span>
                    </div>
                  )}
                </div>
                {c.last_contact_date && (
                  <p className="text-[10px] text-slate-400 mt-1">Last contact: {timeAgo(c.last_contact_date)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interaction timeline */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">Interaction timeline</h3>
        {interactions.length === 0 ? (
          <p className="text-xs text-slate-400">No interactions recorded for this company.</p>
        ) : (
          <div className="space-y-3">
            {interactions.map(i => (
              <div key={i.id} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${TYPE_ICON_BG[i.type] ?? "bg-slate-100 text-slate-500"}`}>
                  {i.type.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-slate-800 truncate">{i.subject ?? i.type}</p>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">{timeAgo(i.date)}</span>
                  </div>
                  {i.attendees && i.attendees.length > 0 && (
                    <p className="text-[11px] text-slate-500">
                      {i.attendees.slice(0, 3).map(a => a.name).join(", ")}
                      {i.attendees.length > 3 ? ` +${i.attendees.length - 3}` : ""}
                    </p>
                  )}
                  {i.summary && (
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{i.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {i.transcript_url && (
                      <a href={i.transcript_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                        Transcript
                      </a>
                    )}
                    {i.ai_summary && (
                      <span className="text-[10px] text-violet-600">AI summary</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Board composition */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Board composition</h3>
          <button
            onClick={() => setAddingBoard(true)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {addingBoard && (
          <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
            <input
              autoFocus
              placeholder="Name"
              value={boardForm.name}
              onChange={e => setBoardForm(p => ({ ...p, name: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <select
              value={boardForm.role}
              onChange={e => setBoardForm(p => ({ ...p, role: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5"
            >
              <option>Board member</option>
              <option>Observer</option>
              <option>Advisor</option>
              <option>Chair</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setAddingBoard(false)} className="text-xs px-3 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddBoard} disabled={!boardForm.name.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">Add</button>
            </div>
          </div>
        )}

        {boardMembers.length === 0 ? (
          <p className="text-xs text-slate-400">No board members added.</p>
        ) : (
          <div className="space-y-1.5">
            {boardMembers.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <div>
                  <span className="text-[13px] font-medium text-slate-800">{m.name}</span>
                  <span className="text-[11px] text-slate-500 ml-2">{m.role}</span>
                </div>
                <button
                  onClick={() => setBoardMembers(prev => prev.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Value-add log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Value-add log</h3>
          <button
            onClick={() => setAddingValueAdd(true)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            <Plus size={11} /> Add
          </button>
        </div>

        {addingValueAdd && (
          <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
            <input
              autoFocus
              placeholder="What did we do for this company?"
              value={vaForm.description}
              onChange={e => setVaForm(p => ({ ...p, description: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleAddValueAdd(); if (e.key === "Escape") setAddingValueAdd(false); }}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <select
              value={vaForm.category}
              onChange={e => setVaForm(p => ({ ...p, category: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5"
            >
              {VALUE_ADD_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setAddingValueAdd(false)} className="text-xs px-3 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddValueAdd} disabled={savingVa || !vaForm.description.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                {savingVa ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {valueAdd.length === 0 ? (
          <p className="text-xs text-slate-400">No value-add logged yet.</p>
        ) : (
          <div className="space-y-2">
            {valueAdd.map(va => (
              <div key={va.id} className="flex items-start gap-2.5 group">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${CATEGORY_BADGE[va.category] ?? "bg-slate-100 text-slate-500"}`}>
                  {CATEGORY_LABEL[va.category] ?? va.category}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-slate-700">{va.description}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(va.date)}</p>
                </div>
                <button
                  onClick={() => handleDeleteValueAdd(va.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5 flex-shrink-0"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
