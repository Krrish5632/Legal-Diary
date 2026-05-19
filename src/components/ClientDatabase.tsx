import React from 'react';
import { Users, Plus, Search, Phone, Mail, MapPin, Trash2, Edit2, X, Check, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getClients, saveClient, deleteClient, Client } from '../lib/clients';
import { storage } from '../lib/storage';
import { cn } from '../lib/utils';

const EMPTY: Omit<Client,'id'|'createdAt'> = { name:'', phone:'', email:'', address:'', city:'', caseIds:[], notes:'' };

export const ClientDatabase = () => {
  const [clients, setClients] = React.useState(getClients());
  const [search, setSearch] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string|null>(null);
  const [form, setForm] = React.useState<Omit<Client,'id'|'createdAt'>>(EMPTY);
  const cases = storage.getCases();

  const refresh = () => setClients(getClients());

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (!form.name.trim()) return;
    const client: Client = {
      id: editingId || Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...form,
    };
    saveClient(client);
    refresh();
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
  };

  const handleEdit = (c: Client) => {
    setForm({ name:c.name, phone:c.phone, email:c.email, address:c.address, city:c.city, caseIds:c.caseIds, notes:c.notes });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this client?')) { deleteClient(id); refresh(); }
  };

  const initials = (name: string) => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const COLORS = ['bg-purple-500','bg-blue-500','bg-green-500','bg-amber-500','bg-red-500','bg-indigo-500'];

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 shrink-0" style={{ background:'linear-gradient(135deg, #0a0f1e, #0f1a3d)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <Users size={24} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-blue-400">Manage</p>
              <h2 className="text-2xl font-display font-bold text-white">Clients</h2>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">
            <Plus size={16} /> Add Client
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)' }}>
          <Search size={16} className="text-zinc-400" />
          <input className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm outline-none"
            placeholder="Search by name, phone, city..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
            <motion.div initial={{y:60}} animate={{y:0}} exit={{y:60}}
              className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
              <div className="p-5 border-b flex justify-between items-center"
                style={{ background:'linear-gradient(135deg, #0a0f1e, #0f1a3d)' }}>
                <h3 className="text-white font-bold text-lg">{editingId ? 'Edit Client' : 'New Client'}</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-white/10 rounded-xl text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { key:'name', label:'Full Name *', placeholder:'Ramesh Kumar' },
                  { key:'phone', label:'Phone', placeholder:'+91 98765 43210' },
                  { key:'email', label:'Email', placeholder:'client@email.com' },
                  { key:'city', label:'City', placeholder:'Varanasi' },
                  { key:'address', label:'Address', placeholder:'House No., Street...' },
                  { key:'notes', label:'Notes', placeholder:'Additional notes...' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block mb-1.5">{f.label}</label>
                    {f.key === 'address' || f.key === 'notes' ? (
                      <textarea placeholder={f.placeholder} rows={2}
                        value={(form as any)[f.key]}
                        onChange={e => setForm({...form, [f.key]: e.target.value})}
                        className="w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-blue-400 resize-none" />
                    ) : (
                      <input placeholder={f.placeholder}
                        value={(form as any)[f.key]}
                        onChange={e => setForm({...form, [f.key]: e.target.value})}
                        className="w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-blue-400" />
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button onClick={() => setShowForm(false)}
                    className="py-3.5 bg-zinc-100 text-zinc-600 rounded-2xl font-bold">Cancel</button>
                  <button onClick={handleSave} disabled={!form.name.trim()}
                    className="py-3.5 bg-blue-600 text-white rounded-2xl font-bold disabled:opacity-40">
                    {editingId ? 'Update' : 'Save Client'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Client List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="text-zinc-200 mb-3" />
            <p className="font-bold text-zinc-400">{search ? 'No clients found' : 'No clients yet'}</p>
            <p className="text-sm text-zinc-300 mt-1">{search ? 'Try different search' : 'Add your first client'}</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold text-zinc-400">{filtered.length} client{filtered.length>1?'s':''}</p>
            {filtered.map((c, i) => {
              const clientCases = cases.filter(cs => cs.parties.plaintiff === c.name || cs.parties.defendant === c.name);
              return (
                <motion.div key={c.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}
                  className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-sm shrink-0', COLORS[i%COLORS.length])}>
                      {initials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900">{c.name}</p>
                      <div className="flex gap-3 mt-0.5">
                        {c.phone && <span className="text-xs text-zinc-400 flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                        {c.city && <span className="text-xs text-zinc-400 flex items-center gap-1"><MapPin size={10} />{c.city}</span>}
                      </div>
                      {clientCases.length > 0 && (
                        <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1 mt-1">
                          <Briefcase size={10} />{clientCases.length} case{clientCases.length>1?'s':''}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleEdit(c)} className="p-2 bg-zinc-50 rounded-xl text-zinc-400 hover:text-blue-500 transition-all">
                        <Edit2 size={15} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 bg-zinc-50 rounded-xl text-zinc-400 hover:text-red-500 transition-all">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {c.notes && <p className="text-xs text-zinc-400 mt-2 pl-15 ml-15">{c.notes}</p>}
                </motion.div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
