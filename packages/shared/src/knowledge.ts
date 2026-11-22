export interface KnowledgeNoteInput {
  area: string;
  title: string;
  bodyHtml: string;
  paths: string[];
}

export interface KnowledgeNote extends KnowledgeNoteInput {
  id: string;
  bodyText: string;
}

export type KnowledgeContext = Omit<KnowledgeNote, "id" | "bodyHtml">;

export interface KnowledgeApi {
  list(): Promise<KnowledgeNote[]>;
  save(id: string | null, input: KnowledgeNoteInput): Promise<KnowledgeNote>;
  remove(id: string): Promise<void>;
}

export function groupKnowledgeNotes(notes: readonly KnowledgeNote[]): Map<string, KnowledgeNote[]> {
  const areas = new Map<string, KnowledgeNote[]>();
  for (const note of notes) {
    const areaNotes = areas.get(note.area);
    if (areaNotes) areaNotes.push(note);
    else areas.set(note.area, [note]);
  }
  return areas;
}
