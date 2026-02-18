/**
 * OpenMoji icon helpers for persona icons.
 *
 * Icons are loaded from jsDelivr CDN (CC BY-SA 4.0).
 * Full emoji data (~1.5MB JSON) is fetched on demand and cached in memory.
 */

// === CDN URLS ===

const OPENMOJI_VERSION = '15.1';
const OPENMOJI_DATA_URL = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/data/openmoji.json`;
const OPENMOJI_SVG_URL = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg`;

// === TYPES ===

export interface OpenMojiEntry {
  hexcode: string;
  emoji: string;
  annotation: string;
  tags: string;
  openmoji_tags: string;
  group: string;
  subgroups: string;
}

// === QUICK PICKS (40 curated icons shown by default) ===

export const QUICK_PICK_ICONS: string[] = [
  // Row 1: Faces & People
  '1F60A', '1F60E', '1F913', '1F9D0', '1F608', '1F916',
  '1F468-200D-1F4BC', '1F469-200D-2695-FE0F', '1F9D1-200D-1F3EB', '1F468-200D-1F52C',
  // Row 2: Business & Achievement
  '1F9B8', '1F9D9', '1F4BC', '1F4CA', '1F4C8', '1F4B0',
  '1F3AF', '1F3C6', '1F4BB', '1F52C',
  // Row 3: Communication & Animals
  '2699', '1F9EA', '1F4AC', '1F4E2', '1F3A4', '1F4DD',
  '1F98A', '1F981', '1F43A', '1F985',
  // Row 4: Symbols & Nature
  '2B50', '1F525', '1F4A1', '1F3A8', '1F3AD', '1F3AA',
  '1F48E', '1F680', '26A1', '1F31F',
];

// === CACHED DATA ===

let emojiData: OpenMojiEntry[] | null = null;

// === PUBLIC API ===

/** Get SVG URL for a hexcode. */
export function getIconUrl(hexcode: string): string {
  return `${OPENMOJI_SVG_URL}/${hexcode}.svg`;
}

/** Load full emoji data from CDN (cached after first call). */
export async function loadEmojiData(): Promise<OpenMojiEntry[]> {
  if (emojiData) return emojiData;

  const response = await fetch(OPENMOJI_DATA_URL);
  const data = (await response.json()) as OpenMojiEntry[];
  emojiData = data;
  return data;
}

/** Search emojis by query string. Searches annotation, tags, and openmoji_tags. */
export async function searchIcons(query: string, limit = 50): Promise<OpenMojiEntry[]> {
  const data = await loadEmojiData();
  const q = query.toLowerCase().trim();

  if (!q) return [];

  return data
    .filter(
      (e) =>
        e.annotation.toLowerCase().includes(q) ||
        e.tags.toLowerCase().includes(q) ||
        e.openmoji_tags.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

/** Get quick pick entries (resolved from full data). */
export async function getQuickPicks(): Promise<OpenMojiEntry[]> {
  const data = await loadEmojiData();
  return QUICK_PICK_ICONS
    .map((hex) => data.find((e) => e.hexcode === hex))
    .filter((e): e is OpenMojiEntry => e !== undefined);
}
