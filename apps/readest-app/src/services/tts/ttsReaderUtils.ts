import type { FoliateTTS, FoliateView } from '@/types/view';

export type TTSPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface TTSPlaybackSnapshot {
  status: TTSPlaybackStatus;
  progress: number;
  voiceId: string | null;
  error: string | null;
}

export interface TTSStartLocation {
  cfi: string;
  index: number;
}

export interface TTSSpeechSegment {
  text: string;
  markName: string | null;
}

export class TTSSelectionRequiredError extends Error {
  constructor() {
    super('Select text before starting TTS');
    this.name = 'TTSSelectionRequiredError';
  }
}

const normalizeSpeechText = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const ssmlToSegments = (ssml: string): TTSSpeechSegment[] => {
  if (typeof DOMParser === 'undefined') {
    const text = normalizeSpeechText(ssml.replace(/<[^>]+>/g, ' '));
    return text ? [{ text, markName: null }] : [];
  }

  const document = new DOMParser().parseFromString(ssml, 'application/xml');
  const segments: TTSSpeechSegment[] = [];
  let markName: string | null = null;
  let text = '';
  const flush = () => {
    const normalized = normalizeSpeechText(text);
    if (normalized) segments.push({ text: normalized, markName });
    text = '';
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      text += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    const element = node as Element;
    if (element.localName === 'mark') {
      flush();
      markName = element.getAttribute('name');
      return;
    }
    if (element.localName === 'break' || element.localName === 'br') text += ' ';
    for (const child of Array.from(node.childNodes)) visit(child);
  };
  visit(document);
  flush();
  return segments;
};

export const getSelectedStartLocation = (view: FoliateView): TTSStartLocation | null => {
  const { renderer } = view;
  const contents = renderer.getContents();
  const primary = contents.find(({ index }) => index === renderer.primaryIndex);
  const orderedContents = primary
    ? [primary, ...contents.filter((content) => content !== primary)]
    : contents;

  for (const { doc, index = renderer.primaryIndex } of orderedContents) {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) continue;
    const range = selection.getRangeAt(0);
    if (!range.toString().trim()) continue;
    try {
      return { cfi: view.getCFI(index, range), index };
    } catch {
      // Try the next rendered document when the selection cannot be converted.
    }
  }
  return null;
};

export const getNextSectionIndex = (view: FoliateView): number | null => {
  const sections = view.book?.sections ?? [];
  for (let index = view.renderer.primaryIndex + 1; index < sections.length; index += 1) {
    if (sections[index]?.linear !== 'no') return index;
  }
  return null;
};

export const getSelectedSpeechSegments = (
  view: FoliateView,
  tts: FoliateTTS,
  startLocation: TTSStartLocation,
): string | undefined => {
  const content = view.renderer.getContents().find(({ index }) => index === startLocation.index);
  const range = content?.doc ? view.resolveCFI(startLocation.cfi).anchor(content.doc) : null;
  return range ? tts.from(range) : undefined;
};
