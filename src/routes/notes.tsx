import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, ChevronRight, FileDown, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { displaySubject, loadNotes, noteSubjects, type NoteRecord } from '@/lib/notes';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/notes')({ component: NotesHome });

function NotesHome() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState('all');
  const [loading, setLoading] = useState(true);
  useEffect(() => { void loadNotes().then(d => setNotes(d.notes)).finally(() => setLoading(false)); }, []);
  const subjects = useMemo(() => noteSubjects(notes), [notes]);
  const visible = useMemo(() => notes.filter(n => (subject === 'all' || n.subject === subject) && (!q || `${n.title} ${n.subject} ${n.year} ${n.content}`.toLowerCase().includes(q.toLowerCase()))), [notes,q,subject]);
  const totalWords = useMemo(() => notes.reduce((n,x) => n + x.content.trim().split(/\s+/).filter(Boolean).length,0), [notes]);
  return <AppShell>
    <section className="notes-hero">
      <div>
        <p className="eyebrow">KUHS study library</p>
        <h1>Exam notes, organized like a real reference book.</h1>
        <p>Read the full AI-prepared notes in a clean, print-ready layout — with formulas, tables, links, code/ASCII figures, question markers and paper/year navigation preserved.</p>
      </div>
      <div className="notes-stat-grid">
        <Stat label="Note sets" value={notes.length}/><Stat label="Subjects" value={subjects.length}/><Stat label="Words" value={totalWords.toLocaleString()}/>
      </div>
    </section>
    <div className="notes-toolbar">
      <div className="notes-search"><Search className="size-4"/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search notes, questions, topics…"/></div>
      <div className="notes-filters"><SlidersHorizontal className="size-4 text-muted-foreground"/>{['all',...subjects].map(s=><button key={s} className={cn('note-filter',subject===s&&'active')} onClick={()=>setSubject(s)}>{s==='all'?'All':displaySubject(s)}</button>)}</div>
    </div>
    {loading ? <div className="notes-loading">Loading notes…</div> : <div className="note-set-grid">{visible.map(n=><NoteSetCard key={n.id} note={n}/>)}</div>}
    {!loading && !visible.length ? <div className="notes-empty"><BookOpen/><h2>No matching notes</h2><p>Try another subject or search term.</p></div>:null}
  </AppShell>;
}
function NoteSetCard({note}:{note:NoteRecord}) { return <Link to="/notes/$subject" params={{subject:displaySubject(note.subject)}} search={{note:note.id}} className="note-set-card">
  <div className="note-card-top"><Badge variant="accent">{displaySubject(note.subject)}</Badge><span>{note.year}</span></div>
  <h2>{note.title}</h2><p>{note.content.replace(/\[\[KUHS-QUESTION:[^\]]+\]\]/g,'').replace(/[#*`]/g,'').slice(0,220)}…</p>
  <div className="note-card-bottom"><span>{note.mode==='ai_internet'?'Internet-based':'Textbook-based'}</span><ChevronRight className="size-4"/></div>
</Link> }
function Stat({label,value}:{label:string,value:string|number}) { return <div><span>{label}</span><strong>{value}</strong></div> }
