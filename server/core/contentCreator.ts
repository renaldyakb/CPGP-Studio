import fs from 'node:fs';
import path from 'node:path';
import { composeCaptionFromParts } from '../../shared/captionParser.ts';
import { DEFAULT_TIME_SLOTS } from '../../shared/rulePresets.ts';
import type {
  BatchGenerateSlotsInput,
  CreateContentSlotInput,
  NextSuggestedSlot,
  WorkspaceMetadata,
} from '../../shared/types/workspace.ts';
import type { PlannerDatabase } from '../../src/types/planner.ts';
import { toPosixPath } from '../scanner.ts';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function getDefaultMonthFolderName(): string {
  const monthIdx = new Date().getMonth();
  return INDONESIAN_MONTHS[monthIdx] ?? 'November';
}

export function suggestNextAvailableSlot(
  db: PlannerDatabase,
  workspace: WorkspaceMetadata,
  preferredMonth?: string
): NextSuggestedSlot {
  const allItems = Object.values(db.items);
  const slotDefs =
    workspace.timeSlots && Object.keys(workspace.timeSlots).length > 0
      ? workspace.timeSlots
      : DEFAULT_TIME_SLOTS;
  const orderedSlotCodes = Object.keys(slotDefs).sort();
  const primarySlotCode = orderedSlotCodes[0] ?? '01';

  let monthFolder = (preferredMonth ?? '').trim();
  if (!monthFolder) {
    if (allItems.length > 0) {
      const sorted = [...allItems].sort((a, b) =>
        b.schedule.isoDate.localeCompare(a.schedule.isoDate)
      );
      monthFolder = sorted[0].monthFolder || getDefaultMonthFolderName();
    } else {
      monthFolder = getDefaultMonthFolderName();
    }
  }

  const monthItems = allItems.filter(
    (item) => item.monthFolder.toLowerCase() === monthFolder.toLowerCase()
  );

  const occupiedCodes = new Set<string>(
    monthItems.map((item) => item.folderCode)
  );

  let maxDay = 0;
  for (const item of monthItems) {
    if (item.schedule.dayOfMonth > maxDay) {
      maxDay = item.schedule.dayOfMonth;
    }
  }

  const startDay = maxDay > 0 ? maxDay : new Date().getDate();

  for (let offset = 0; offset < 31; offset += 1) {
    const candidateDay = ((startDay - 1 + offset) % 31) + 1;
    const paddedDay = String(candidateDay).padStart(2, '0');

    for (const slotCode of orderedSlotCodes) {
      const candidateCode = `${paddedDay}.${slotCode}`;
      if (!occupiedCodes.has(candidateCode)) {
        const slotMeta = slotDefs[slotCode] ?? {
          code: slotCode,
          label: slotCode === '01' ? 'Siang' : slotCode === '02' ? 'Malam' : `Slot ${slotCode}`,
          window: '11.30 - 12.00 WIB',
        };
        return {
          monthFolder,
          dayOfMonth: candidateDay,
          slotCode,
          folderCode: candidateCode,
          slotLabel: slotMeta.label,
          slotTimeWindow: slotMeta.window,
        };
      }
    }
  }

  const fallbackDay = Math.min(31, Math.max(1, startDay));
  const fallbackCode = `${String(fallbackDay).padStart(2, '0')}.${primarySlotCode}`;
  const fallbackSlotMeta = slotDefs[primarySlotCode] ?? DEFAULT_TIME_SLOTS['01'];

  return {
    monthFolder,
    dayOfMonth: fallbackDay,
    slotCode: primarySlotCode,
    folderCode: fallbackCode,
    slotLabel: fallbackSlotMeta.label,
    slotTimeWindow: fallbackSlotMeta.window,
  };
}

export function createContentFolderOnDisk(
  workspace: WorkspaceMetadata,
  input: CreateContentSlotInput
): { itemId: string; folderPath: string; captionPath: string } {
  const day = Math.min(31, Math.max(1, Math.floor(Number(input.dayOfMonth) || 1)));
  const rawSlot = (input.slotCode ?? '01').trim();
  const slotCode = /^\d+$/.test(rawSlot) ? rawSlot.padStart(2, '0') : rawSlot || '01';
  const folderCode = `${String(day).padStart(2, '0')}.${slotCode}`;

  const rawMonth = (input.monthFolder ?? '').trim();
  const isFlat =
    workspace.rules.folderStructure === 'flat_slot' && !rawMonth;
  const monthFolder = isFlat ? '' : rawMonth || getDefaultMonthFolderName();

  const folderPath = monthFolder
    ? path.join(workspace.contentRootPath, monthFolder, folderCode)
    : path.join(workspace.contentRootPath, folderCode);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const captionFileName =
    workspace.rules.fileRules?.captionFileName?.trim() || 'caption.txt';
  const captionPath = path.join(folderPath, captionFileName);

  let captionText = '';
  if (typeof input.rawCaptionText === 'string' && input.rawCaptionText.trim()) {
    captionText = input.rawCaptionText.trim();
  } else if (
    (input.hookTitle && input.hookTitle.trim()) ||
    (input.ctaQuestion && input.ctaQuestion.trim()) ||
    (Array.isArray(input.hashtags) && input.hashtags.length > 0)
  ) {
    const hashtags =
      Array.isArray(input.hashtags) && input.hashtags.length > 0
        ? input.hashtags
        : workspace.rules.defaultHashtags;
    captionText = composeCaptionFromParts({
      hookTitle: input.hookTitle,
      ctaQuestion:
        input.ctaQuestion && input.ctaQuestion.trim()
          ? input.ctaQuestion
          : 'Menurut kamu bagaimana? Tulis di komentar.',
      hashtags,
    });
  } else {
    captionText =
      workspace.rules.captionTemplate ||
      composeCaptionFromParts({
        hookTitle: '',
        ctaQuestion: '',
        hashtags: workspace.rules.defaultHashtags,
      });
  }

  const normalizedText = captionText.replace(/\r\n?/g, '\n');
  fs.writeFileSync(captionPath, normalizedText + '\n', 'utf-8');

  const itemId = toPosixPath(
    path.relative(workspace.contentRootPath, folderPath)
  );

  return {
    itemId,
    folderPath,
    captionPath,
  };
}

export function batchGenerateSlotsOnDisk(
  workspace: WorkspaceMetadata,
  input: BatchGenerateSlotsInput
): {
  createdCodes: string[];
  skippedCodes: string[];
  monthFolder: string;
} {
  const startDay = Math.min(
    31,
    Math.max(1, Math.floor(Number(input.startDay) || 1))
  );
  const endDay = Math.min(
    31,
    Math.max(startDay, Math.floor(Number(input.endDay) || startDay))
  );

  const slotCodes =
    Array.isArray(input.slotCodes) && input.slotCodes.length > 0
      ? input.slotCodes.map((s) =>
          /^\d+$/.test(s.trim()) ? s.trim().padStart(2, '0') : s.trim()
        )
      : ['01', '02'];

  const rawMonth = (input.monthFolder ?? '').trim();
  const isFlat =
    workspace.rules.folderStructure === 'flat_slot' && !rawMonth;
  const monthFolder = isFlat ? '' : rawMonth || getDefaultMonthFolderName();

  const hashtags =
    Array.isArray(input.defaultHashtags) && input.defaultHashtags.length > 0
      ? input.defaultHashtags
      : workspace.rules.defaultHashtags;

  const ctaQuestion =
    typeof input.ctaTemplate === 'string' && input.ctaTemplate.trim()
      ? input.ctaTemplate.trim()
      : 'Menurut kamu bagaimana? Tulis di komentar.';

  const captionFileName =
    workspace.rules.fileRules?.captionFileName?.trim() || 'caption.txt';

  const createdCodes: string[] = [];
  const skippedCodes: string[] = [];

  for (let day = startDay; day <= endDay; day += 1) {
    const paddedDay = String(day).padStart(2, '0');
    for (const slotCode of slotCodes) {
      const folderCode = `${paddedDay}.${slotCode}`;
      const folderPath = monthFolder
        ? path.join(workspace.contentRootPath, monthFolder, folderCode)
        : path.join(workspace.contentRootPath, folderCode);

      if (fs.existsSync(folderPath)) {
        skippedCodes.push(folderCode);
        continue;
      }

      fs.mkdirSync(folderPath, { recursive: true });
      const captionPath = path.join(folderPath, captionFileName);
      const captionBody = composeCaptionFromParts({
        hookTitle: `Draft topik konten ${folderCode}`,
        ctaQuestion,
        hashtags,
      });

      fs.writeFileSync(
        captionPath,
        captionBody.replace(/\r\n?/g, '\n') + '\n',
        'utf-8'
      );
      createdCodes.push(folderCode);
    }
  }

  return {
    createdCodes,
    skippedCodes,
    monthFolder: monthFolder || 'Root',
  };
}
