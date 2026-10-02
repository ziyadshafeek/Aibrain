import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Download, Minus, Plus, Printer, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { MarkdownNote } from '@/components/markdown-note';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { contentForYear, displaySubject, loadNotes, noteYears, splitNoteByPapers, type NoteRecord } from '@/lib/notes';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/notes/$subject')({
  validateSearch: (s:Record<string,unknown>) => ({ note: typeof s.note==='string'?s.note:undefined }),
  component: NotesSubject,
});

function NotesSubject(){
 const {subject}=Route.useParams(); const search=Route.useSearch(); const [notes,setNotes]=useState<NoteRecord[]>([]); const [q,setQ]=useState(''); const [year,setYear]=useState('all'); const [zoom,setZoom]=useState(100); const [loading,setLoading]=useState(true);
 useEffect(()=>{void loadNotes().then(d=>setNotes(d.notes.filter(n=>displaySubject(n.subject)===displaySubject(decodeURIComponent(subject))))).finally(()=>setLoading(false));},[subject]);
 const active=notes.find(n=>n.id===search.note)||notes[0];
 const years=useMemo(()=>noteYears(notes),[notes]);
 const filteredContent=useMemo(()=>active ? contentForYear(active.content, year) : '', [active, year]);
 const outline=useMemo(()=>splitNoteByPapers(filteredContent),[filteredContent]);
 const searchHits=useMemo(()=>active&&q.trim()?((active.content.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))??[]).length):0,[active,q]);
 function print(){window.print();}
 return <AppShell dense>
  <div className="notes-breadcrumb"><Link to="/notes"><ArrowLeft className="size-3.5"/> Notes</Link><span>/</span><span>{displaySubject(decodeURIComponent(subject))}</span></div>
  <header className="notes-reader-head"><div><p className="eyebrow">Study notes</p><h1>{displaySubject(decodeURIComponent(subject))}</h1><p>{notes.length} note set{notes.length===1?'':'s'} · {years.join(' · ')}</p></div><div className="reader-actions"><Button variant="outline" onClick={()=>setZoom(z=>Math.max(80,z-10))}><Minus/></Button><span className="zoom-value">{zoom}%</span><Button variant="outline" onClick={()=>setZoom(z=>Math.min(140,z+10))}><Plus/></Button><Button variant="outline" onClick={print}><Printer/> PDF / Print</Button><Button variant="default" onClick={print}><Download/> Save PDF</Button></div></header>
  <div className="year-toolbar"><span>Year</span><button className={cn('year-select',year==='all'&&'active')} onClick={()=>setYear('all')}>All years</button>{years.map(y=><button key={y} className={cn('year-select',year===y&&'active')} onClick={()=>setYear(y)}>{y}</button>)}{q?<span className="search-hit-count">{searchHits} match{searchHits===1?'':'es'} in this note set</span>:null}</div>
  <div className="notes-layout">
   <aside className="notes-sidebar">
    <div className="sidebar-search"><Search/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Find in notes…"/></div>
    <p className="sidebar-label">Note sets</p>
    {notes.map(n=><Link key={n.id} to="/notes/$subject" params={{subject:displaySubject(n.subject)}} search={{note:n.id}} className={cn('note-nav-item',active?.id===n.id&&'active')}><span>{n.title}</span><small>{n.year}</small></Link>)}
    <p className="sidebar-label">Years</p>{years.map(y=><span className="year-pill" key={y}>{y}</span>)}
    <p className="sidebar-label">In this note</p>
    {outline.map((item,i)=>{const label=item.heading.replace(/^#{2,4}\s+/,''); const id='note-'+label.replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').toLowerCase(); return <a key={`${id}-${i}`} className="outline-link" href={`#${id}`}>{label}</a>;})}
   </aside>
   <main className="notes-reader-shell">
    {loading?<div className="notes-loading">Loading notes…</div>:active?<><div className="reader-meta"><Badge variant="accent">{active.mode==='ai_internet'?'Internet-based':'Textbook-based'}</Badge><span>{active.year}</span><span>·</span><span>{active.content.length.toLocaleString()} characters</span></div><div className="reader-paper" id="printable-notes"><MarkdownNote content={filteredContent} zoom={zoom}/></div></>:<div className="notes-empty">No notes found.</div>}
   </main>
  </div>
 </AppShell>
}
