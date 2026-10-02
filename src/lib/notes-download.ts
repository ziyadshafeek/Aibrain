import { jsPDF } from "jspdf";
import { downloadBlob, slugify } from "@/lib/utils";
import { sittingLabel, type StudyNote } from "@/lib/notes";

function ascii(value: string) {
  return value
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022|\uf0b7/g, "-")
    .replace(/\[\[KUHS-QUESTION:[^\]]+\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, "").trim())
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\[\[KUHS-QUESTION:[^\]]+\]\]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "• ");
}

export function notesToText(notes: StudyNote[], scope: string) {
  const lines = [
    "KUHS MBBS study notes",
    scope,
    `${notes.length} question${notes.length === 1 ? "" : "s"}`,
    "Mapped to official KUHS questions. Grouped MCQs are excluded from the mapping.",
    "",
    "=".repeat(72),
    "",
  ];

  let sitting = "";
  for (const note of notes) {
    const sit = sittingLabel(note);
    if (sit !== sitting) {
      sitting = sit;
      lines.push(sit.toUpperCase());
      lines.push("-".repeat(72), "");
    }

    lines.push(`${note.qcode}  ${note.section}`);
    lines.push(note.questionText ?? note.title);
    lines.push("");

    if (note.kind === "missing") {
      lines.push("NO CONFIDENTLY MAPPED STUDY NOTE FOR THIS QUESTION.");
    } else {
      lines.push(stripMarkdown(note.content));
    }

    if (note.refs.length) {
      lines.push("", "See also: " + note.refs.map((r) => r.label).join("; "));
    }
    lines.push("", "");
  }

  return lines.join("\n");
}

export function downloadNotesText(notes: StudyNote[], scope: string) {
  const body = notesToText(notes, scope);
  const name = `KUHS-notes-${slugify(scope) || "pack"}.txt`;
  downloadBlob(new Blob([body], { type: "text/plain;charset=utf-8" }), name);
}

export function downloadNotesPdf(notes: StudyNote[], scope: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = 297;
  const width = 174;
  let y = 22;

  const write = (text: string, size: number, bold = false, gap = 5) => {
    doc.setFont("times", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(ascii(text), width);
    for (const line of wrapped) {
      if (y > pageHeight - 17) {
        doc.addPage();
        y = 18;
      }
      doc.text(line, 18, y);
      y += Math.max(4, size * 0.42);
    }
    y += gap;
  };

  write("KUHS MBBS Study Notes", 18, true, 3);
  write(scope, 11, false, 3);
  write(
    `${notes.length} questions · grouped MCQs intentionally excluded from mapping`,
    9,
    false,
    9,
  );

  let sitting = "";
  for (const note of notes) {
    const sit = sittingLabel(note);
    if (sit !== sitting) {
      sitting = sit;
      if (y > 35) {
        doc.addPage();
        y = 18;
      }
      write(sit, 14, true, 5);
    }

    write(`${note.qcode} · ${note.section}`, 10, true, 2);
    write(note.questionText ?? note.title, 11, true, 4);

    if (note.kind === "missing") {
      doc.setTextColor(105);
      write("No confidently mapped study note for this question.", 10, false, 7);
      doc.setTextColor(0);
    } else {
      write(stripMarkdown(note.content), 10.2, false, 5);
    }

    if (note.refs.length) {
      doc.setTextColor(80);
      write("See also: " + note.refs.map((r) => r.label).join("; "), 9, false, 7);
      doc.setTextColor(0);
    }
  }

  doc.save(`KUHS-notes-${slugify(scope) || "pack"}.pdf`);
}
