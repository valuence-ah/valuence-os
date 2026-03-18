"use client";
// ─── Pending Contacts Client ──────────────────────────────────────────────────
// Displays contacts with status = "pending" (created by Make.com automations).
// User fills in type, title, city, country, then confirms → sets status = active.
// Or discards → deletes the contact.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactType } from "@/lib/types";
import { getInitials, formatDate } from "@/lib/utils";
import { Check, X, Mail, Phone, ExternalLink, Building2, UserPlus } from "lucide-react";

type Company = { id: string; name: string; type: string };
type PendingContact = Contact & { company?: Company | null };

interface Props {
  initialContacts: PendingContact[];
  companies: Company[];
}

const CONTACT_TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "founder",           label: "Founder / Management" },
  { value: "lp",                label: "Limited Partner" },
  { value: "fund_manager",      label: "Fund Manager / VC" },
  { value: "corporate",         label: "Corporate / Strategic" },
  { value: "ecosystem_partner", label: "Ecosystem Partner" },
  { value: "government",        label: "Government / Academic" },
  { value: "advisor",           label: "Advisor / KOL" },
  { value: "other",             label: "Other" },
];

interface EditState {
  type: ContactType;
  title: string;
  location_city: string;
  location_country: string;
  company_id: string;
}

export function PendingContactsClient({ initialContacts, companies }: Props) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<PendingContact[]>(initialContacts);
  const [edits, setEdits]       = useState<Record<string, EditState>>(() => {
    const init: Record<string, EditState> = {};
    initialContacts.forEach(c => {
      init[c.id] = {
        type:             c.type as ContactType,
        title:            c.title ?? "",
        location_city:    "",
        location_country: "",
        company_id:       c.company_id ?? "",
      };
    });
    return init;
  });
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  function setEdit(id: string, field: keyof EditState, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function confirm(contact: PendingContact) {
    setProcessing(prev => new Set(prev).add(contact.id));
    const edit = edits[contact.id];

    const { error } = await supabase
      .from("contacts")
      .update({
        status:     "active",
        type:       edit.type,
        title:      edit.title || contact.title,
        company_id: edit.company_id || contact.company_id || null,
        // Store city/country in notes if no dedicated field
        notes: [
          contact.notes,
          edit.location_city    ? `City: ${edit.location_city}`    : "",
          edit.location_country ? `Country: ${edit.location_country}` : "",
        ].filter(Boolean).join(" | ") || null,
      })
      .eq("id", contact.id);

    setProcessing(prev => { const s = new Set(prev); s.delete(contact.id); return s; });

    if (!error) {
      setContacts(prev => prev.filter(c => c.id !== contact.id));
    } else {
      alert(error.message);
    }
  }

  async function discard(id: string) {
    setProcessing(prev => new Set(prev).add(id));
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    if (!error) setContacts(prev => prev.filter(c => c.id !== id));
    else alert(error.message);
  }

  if (contacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <UserPlus size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No pending contacts</p>
          <p className="text-xs mt-1">New contacts from emails will appear here automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        <strong>{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</strong> captured automatically from email.
        Fill in the type, title, and location, then click <strong>Confirm</strong> to add to your CRM.
      </div>

      <div className="space-y-3">
        {contacts.map(c => {
          const edit = edits[c.id] ?? { type: "other", title: "", location_city: "", location_country: "", company_id: "" };
          const busy = processing.has(c.id);

          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-600 text-xs font-bold">
                    {getInitials(`${c.first_name} ${c.last_name}`)}
                  </span>
                </div>

                {/* Contact info (read-only) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="font-semibold text-slate-900">{c.first_name} {c.last_name}</p>
                    <span className="text-xs text-slate-400">Added {formatDate(c.created_at)}</span>
                    {c.company && (
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        <Building2 size={11} /> {c.company.name}
                      </span>
                    )}
                  </div>

                  {/* Links */}
                  <div className="flex gap-3 text-xs text-slate-500 mb-4">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600">
                        <Mail size={12} /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-blue-600">
                        <Phone size={12} /> {c.phone}
                      </a>
                    )}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                        <ExternalLink size={12} /> LinkedIn
                      </a>
                    )}
                  </div>

                  {/* Editable fields */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {/* Type */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type *</label>
                      <select
                        className="select text-xs"
                        value={edit.type}
                        onChange={e => setEdit(c.id, "type", e.target.value)}
                      >
                        {CONTACT_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Job Title */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Job Title</label>
                      <input
                        className="input text-xs"
                        placeholder={c.title || "e.g. CEO"}
                        value={edit.title}
                        onChange={e => setEdit(c.id, "title", e.target.value)}
                      />
                    </div>

                    {/* Company */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Company</label>
                      <select
                        className="select text-xs"
                        value={edit.company_id}
                        onChange={e => setEdit(c.id, "company_id", e.target.value)}
                      >
                        <option value="">{c.company?.name || "— Select —"}</option>
                        {companies.map(co => (
                          <option key={co.id} value={co.id}>{co.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">City</label>
                      <input
                        className="input text-xs"
                        placeholder="e.g. Singapore"
                        value={edit.location_city}
                        onChange={e => setEdit(c.id, "location_city", e.target.value)}
                      />
                    </div>

                    {/* Country */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Country</label>
                      <input
                        className="input text-xs"
                        placeholder="e.g. Singapore"
                        value={edit.location_country}
                        onChange={e => setEdit(c.id, "location_country", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => confirm(c)}
                    disabled={busy}
                    title="Confirm — add to contacts"
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Check size={13} /> Confirm
                  </button>
                  <button
                    onClick={() => discard(c.id)}
                    disabled={busy}
                    title="Discard — delete this contact"
                    className="flex items-center gap-1.5 px-3 py-2 border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-500 text-xs font-medium rounded-lg transition-colors"
                  >
                    <X size={13} /> Discard
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
