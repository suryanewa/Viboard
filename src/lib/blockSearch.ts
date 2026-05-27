import Fuse from 'fuse.js';
import type { Block } from '../types';

export interface BoardBlockDocument {
  id: string;
  blockType: string;
  text: string;
  url?: string;
  title?: string;
  description?: string;
}

let fuseInstance: Fuse<BoardBlockDocument> | null = null;
let documents: BoardBlockDocument[] = [];

const fuseOptions = {
  keys: ['text', 'url', 'title', 'description'],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 2,
};

function blockToDocument(block: Block): BoardBlockDocument {
  const doc: BoardBlockDocument = {
    id: block.id,
    blockType: block.type,
    text: '',
    url: block.data?.url,
    title: block.data?.title,
    description: block.data?.description,
  };

  if (block.type === 'sticky' || block.type === 'text') {
    doc.text = block.data?.text || '';
  } else if (block.type === 'link') {
    doc.text = [block.data?.title, block.data?.description, block.data?.url].filter(Boolean).join(' ');
  }

  return doc;
}

export async function indexBlock(block: Block): Promise<void> {
  const doc = blockToDocument(block);
  const existingIndex = documents.findIndex((d) => d.id === block.id);
  if (existingIndex >= 0) {
    documents[existingIndex] = doc;
  } else {
    documents.push(doc);
  }

  fuseInstance = new Fuse(documents, fuseOptions);
}

export async function removeBlockFromIndex(blockId: string): Promise<void> {
  documents = documents.filter((d) => d.id !== blockId);
  fuseInstance = new Fuse(documents, fuseOptions);
}

export async function searchBlocks(
  query: string,
  options: { per_page?: number; page?: number } = {},
): Promise<BoardBlockDocument[]> {
  if (!query.trim() || !fuseInstance) return [];

  const results = fuseInstance.search(query, { limit: options.per_page ?? 20 });
  return results.map((r) => r.item);
}

export async function syncAllBlocks(blocks: Record<string, Block>): Promise<void> {
  documents = Object.values(blocks)
    .filter((block) => block.type === 'sticky' || block.type === 'text' || block.type === 'link')
    .map(blockToDocument);

  fuseInstance = new Fuse(documents, fuseOptions);
}
