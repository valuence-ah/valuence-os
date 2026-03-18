"use client";
// ─── Contacts Client Component ────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { Plus, Search, Mail, Phone, Linkedin, Filter } from "lucide-react";

const STRENGTH_COLORS: Record<string, string> = {
  strong: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  weak:   "bg-slate-100 text-slate-600",
  new:    "bg-blue-100 text-blue-700",
};

const TYPE_OPTIONS = [
  { value: "all",               label: "All types" },
  { value: "founder",           label: "Founders" },
  { value: "lp",                label: "LPs" },
  { value: "corporate",         label: "Corporates" },
  { value: "ecosystem_partner", label: "Ecosystem Partners" },
  { value: "fund_manager",      label: "Fund Managers" },
  { value: "advisor",           label: "Advisors" },
  { value: "other",             label: "Other" },
];

interface Props { initialContacts: (Contact & { company?: { id: string; name: string; type: string } | null })[]; }

export function ContactsClient({ initialContacts }: Props) {
  const supabase = createClient();
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState<Partial<Contact>>({ type: "founder" });
  const [companies, setCompanies]   = useState<{ id: string; name: string }[]>([]);

  // Load companies for the company dropdown
  async function loadCompanies() {
    if (companies.length > 0) return;
    const { data } = await supabase.from("companies").select("id, name").order("name");
    setCompanies(data ?? []);
  }

  const filtered = useMemo(() => contacts.filter(c => {
    const matchType = typeFilter === "all" || c.type === typeFilter;
    const q = search.toLowerCase();
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    const matchSearch = !q || fullName.includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.title ?? "").toLowerCase().includes(q) || (c.company?.name ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  }), [contacts, search, typeFilter]);

  function setField(k: keyof Contact, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("contacts").insert({ ...form, created_by: user?.id }).select("*, company:companies(id, name, type)").single();
    setSaving(false);
    if (!error && data) { setContacts(p => [data, ...p]); setShowModal(false); setForm({ type: "founder" }); }
    else alert(error?.message ?? "Failed to save");
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-56 h-9" placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select className="select pl-8 h-9 w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <button onClick={() => { setShowModal(true); loadCompanies(); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Company</th>
                <th>Relationship</th>
                <th>Last Contact</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">{search ? `No contacts matching "${search}"` : "No contacts yet."}</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {getInitials(`${c.first_name} ${c.last_name}`)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{c.first_name} {c.last_name}</p>
                          {c.title && <p className="text-xs text-slate-400">{c.title}</p>}
                        </div>
                      </div>
                    </td>
                    <td><span className="badge bg-slate-100 text-slate-600 capitalize">{c.type.replace("_", " ")}</span></td>
                    <td>
                      {c.company ? (
                        <a href={`/crm/companies/${c.company.id}`} className="text-sm text-blue-600 hover:underline">{c.company.name}</a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      {c.relationship_strength ? (
                        <span className={cn("badge capitalize", STRENGTH_COLORS[c.relationship_strength])}>{c.relationship_strength}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="text-slate-500 text-xs">{formatDate(c.last_contact_date)}</td>
                    <td>
                      <div className="flex gap-2">
                        {c.email && <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-blue-600"><Mail size={14} /></a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="text-slate-400 hover:text-blue-600"><Phone size={14} /></a>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600"><Linkedin size={14} /></a>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-slate-900">Add Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">First Name *</label>
                  <input required className="input" value={form.first_name ?? ""} onChange={e => setField("first_name", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Last Name *</label>
                  <input required className="input" value={form.last_name ?? ""} onChange={e => setField("last_name", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                  <input className="input" type="email" value={form.email ?? ""} onChange={e => setField("email", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label>
                  <input className="input" type="tel" value={form.phone ?? ""} onChange={e => setField("phone", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Title</label>
                  <input className="input" placeholder="e.g. Co-Founder & CEO" value={form.title ?? ""} onChange={e => setField("title", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type *</label>
                  <select required className="select" value={form.type} onChange={e => setField("type", e.target.value)}>
                    <option value="founder">Founder</option>
                    <option value="lp">LP</option>
                    <option value="corporate">Corporate</option>
                    <option value="ecosystem_partner">Ecosystem Partner</option>
                    <option value="fund_manager">Fund Manager</option>
                    <option value="advisor">Advisor</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company</label>
                  <select className="select" value={form.company_id ?? ""} onChange={e => setField("company_id", e.target.value || null)}>
                    <option value="">— None —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Relationship</label>
                  <select className="select" value={form.relationship_strength ?? ""} onChange={e => setField("relationship_strength", e.target.value || null)}>
                    <option value="">— Select —</option>
                    <option value="strong">Strong</option>
                    <option value="medium">Medium</option>
                    <option value="weak">Weak</option>
                    <option value="new">New</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn URL</label>
                <input className="input" value={form.linkedin_url ?? ""} onChange={e => setField("linkedin_url", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                <textarea className="textarea" rows={2} value={form.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">{saving ? "Saving…" : "Add Contact"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
