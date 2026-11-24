import type { ParsedCaption } from '../src/types/planner.ts';

/**
 * Shared Unicode-aware caption parser & composer used identically by:
 * - Backend disk scanner & content creator
 * - ContentDetailModal caption tab
 * - CreateContentModal caption builder
 */
export function parseCaptionText(rawInput: string): ParsedCaption {
  const normalized = (rawInput || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const trimmed = normalized.trim();

  if (!trimmed) {
    return {
      rawText: '',
      hookTitle: '',
      ctaQuestion: '',
      bodyWithoutHashtags: '',
      hashtags: [],
      charCount: 0,
      wordCount: 0,
      lineCount: 0,
    };
  }

  const hashtagMatches = trimmed.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const hashtags = Array.from(new Set(hashtagMatches));

  const paragraphs = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const isHashtagOnlyParagraph = (para: string): boolean => {
    const withoutTags = para.replace(/#[\p{L}\p{N}_]+/gu, '').trim();
    return withoutTags.length === 0 && /#[\p{L}\p{N}_]+/u.test(para);
  };

  const nonHashtagParagraphs: string[] = [];
  for (const para of paragraphs) {
    if (!isHashtagOnlyParagraph(para)) {
      const lines = para
        .split('\n')
        .filter((line) => !isHashtagOnlyParagraph(line.trim()));
      const cleanedPara = lines.join('\n').trim();
      if (cleanedPara) {
        nonHashtagParagraphs.push(cleanedPara);
      }
    }
  }

  const hookTitle = nonHashtagParagraphs[0] ?? paragraphs[0] ?? '';
  const ctaQuestion =
    nonHashtagParagraphs.length > 1
      ? nonHashtagParagraphs.slice(1).join('\n\n')
      : '';
  const bodyWithoutHashtags = nonHashtagParagraphs.join('\n\n');

  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  const lines = trimmed.split('\n');

  return {
    rawText: trimmed,
    hookTitle,
    ctaQuestion,
    bodyWithoutHashtags,
    hashtags,
    charCount: trimmed.length,
    wordCount: words.length,
    lineCount: lines.length,
  };
}

export function composeCaptionFromParts(params: {
  hookTitle?: string;
  ctaQuestion?: string;
  hashtags?: string[] | string;
}): string {
  const hook = (params.hookTitle ?? '').trim();
  const cta = (params.ctaQuestion ?? '').trim();
  const tagsRaw = Array.isArray(params.hashtags)
    ? params.hashtags
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
        .join(' ')
    : (params.hashtags ?? '').trim();

  return [hook, cta, tagsRaw].filter((part) => part.length > 0).join('\n\n');
}
