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
import {
  formatYearMonthFolder,
  normalizeYearMonthFolderName,
  resolveMonthInfo,
  toPosixPath,
} from '../scanner.ts';

function getDefaultMonthFolderName(fallbackYear?: number): string {
  const now = new Date();
  const year = fallbackYear || now.getFullYear();
  return formatYearMonthFolder(year, now.getMonth() + 1);
}

function toIsoDateParts(date: Date): {
  year: number;
  monthNumber: number;
  dayOfMonth: number;
  isoDate: string;
  monthFolder: string;
} {
  const year = date.getFullYear();
  const monthNumber = date.getMonth() + 1;
  const dayOfMonth = date.getDate();
  const isoDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;
  const monthFolder = formatYearMonthFolder(year, monthNumber);
  return { year, monthNumber, dayOfMonth, isoDate, monthFolder };
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
  if (orderedSlotCodes.length === 0) {
    orderedSlotCodes.push('01', '02');
  }
  const primarySlotCode = orderedSlotCodes[0] ?? '01';
  const fallbackYear = workspace.defaultYear || new Date().getFullYear();

  // Track ALL occupied slots chronologically across every month and year by exact ISO date + slotCode
  const occupiedIsoSlots = new Set<string>();
  const sortedItems = [...allItems].sort((a, b) => {
    const cmpDate = a.schedule.isoDate.localeCompare(b.schedule.isoDate);
    if (cmpDate !== 0) return cmpDate;
    return a.schedule.slotCode.localeCompare(b.schedule.slotCode);
  });

  for (const item of sortedItems) {
    occupiedIsoSlots.add(`${item.schedule.isoDate}::${item.schedule.slotCode}`);
  }

  const latestItem =
    sortedItems.length > 0 ? sortedItems[sortedItems.length - 1] : null;
  const lastOccupiedSlot = latestItem
    ? {
        monthFolder: normalizeYearMonthFolderName(
          latestItem.monthFolder,
          latestItem.schedule.year || fallbackYear
        ),
        folderCode: latestItem.folderCode,
        isoDate: latestItem.schedule.isoDate,
      }
    : null;

  // Determine chronological cursor:
  // - If user explicitly requested a preferredMonth, check that month's latest item or day 1 of that month
  // - Otherwise ALWAYS continue strictly after the latest occupied content item (never jump back to download date!)
  // - If workspace is empty, start from today (in workspace's initialized year)
  let cursorDate: Date;
  if (preferredMonth && preferredMonth.trim()) {
    const prefInfo = resolveMonthInfo(preferredMonth.trim(), fallbackYear);
    const matchingMonthItems = sortedItems.filter(
      (i) =>
        i.schedule.year === prefInfo.year &&
        i.schedule.monthNumber === prefInfo.monthNumber
    );
    if (matchingMonthItems.length > 0) {
      const lastInMonth = matchingMonthItems[matchingMonthItems.length - 1];
      cursorDate = new Date(
        lastInMonth.schedule.year,
        lastInMonth.schedule.monthNumber - 1,
        lastInMonth.schedule.dayOfMonth
      );
    } else if (latestItem) {
      cursorDate = new Date(prefInfo.year, prefInfo.monthNumber - 1, 1);
    } else {
      const now = new Date();
      const startDay =
        prefInfo.year === now.getFullYear() &&
        prefInfo.monthNumber === now.getMonth() + 1
          ? now.getDate()
          : 1;
      cursorDate = new Date(prefInfo.year, prefInfo.monthNumber - 1, startDay);
    }
  } else if (latestItem) {
    cursorDate = new Date(
      latestItem.schedule.year,
      latestItem.schedule.monthNumber - 1,
      latestItem.schedule.dayOfMonth
    );
  } else {
    const now = new Date();
    cursorDate = new Date(fallbackYear, now.getMonth(), now.getDate());
  }

  // Advance day-by-day using real calendar dates (handles 28/29/30/31 days & automatic New Year rollover!)
  for (let dayOffset = 0; dayOffset < 730; dayOffset += 1) {
    const candidateDate = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + dayOffset
    );
    const parts = toIsoDateParts(candidateDate);
    const paddedDay = String(parts.dayOfMonth).padStart(2, '0');

    for (const slotCode of orderedSlotCodes) {
      const isoSlotKey = `${parts.isoDate}::${slotCode}`;
      if (!occupiedIsoSlots.has(isoSlotKey)) {
        const candidateCode = `${paddedDay}.${slotCode}`;
        const slotMeta = slotDefs[slotCode] ?? {
          code: slotCode,
          label:
            slotCode === '01'
              ? 'Siang'
              : slotCode === '02'
                ? 'Malam'
                : `Slot ${slotCode}`,
          window: '11.30 - 12.00 WIB',
        };
        return {
          monthFolder: parts.monthFolder,
          year: parts.year,
          isoDate: parts.isoDate,
          dayOfMonth: parts.dayOfMonth,
          slotCode,
          folderCode: candidateCode,
          slotLabel: slotMeta.label,
          slotTimeWindow: slotMeta.window,
          lastOccupiedSlot,
        };
      }
    }
  }

  const fallbackParts = toIsoDateParts(cursorDate);
  const fallbackCode = `${String(fallbackParts.dayOfMonth).padStart(2, '0')}.${primarySlotCode}`;
  const fallbackSlotMeta = slotDefs[primarySlotCode] ?? DEFAULT_TIME_SLOTS['01'];

  return {
    monthFolder: fallbackParts.monthFolder,
    year: fallbackParts.year,
    isoDate: fallbackParts.isoDate,
    dayOfMonth: fallbackParts.dayOfMonth,
    slotCode: primarySlotCode,
    folderCode: fallbackCode,
    slotLabel: fallbackSlotMeta.label,
    slotTimeWindow: fallbackSlotMeta.window,
    lastOccupiedSlot,
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
  const fallbackYear = workspace.defaultYear || new Date().getFullYear();
  const monthFolder = isFlat
    ? ''
    : rawMonth
      ? normalizeYearMonthFolderName(rawMonth, fallbackYear)
      : getDefaultMonthFolderName(fallbackYear);

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
  const fallbackYear = workspace.defaultYear || new Date().getFullYear();
  const monthFolder = isFlat
    ? ''
    : rawMonth
      ? normalizeYearMonthFolderName(rawMonth, fallbackYear)
      : getDefaultMonthFolderName(fallbackYear);

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
