import type { ScheduleSlotInfo } from '@/types/planner';

export function formatSlotShort(schedule: ScheduleSlotInfo): string {
  const label = schedule.slotLabel?.trim() || `Slot ${schedule.slotCode}`;
  const time = (schedule.recommendedTimeWib || '').trim().replace(':', '.');
  return time ? `${label} ${time}` : label;
}

export function formatSlotFull(schedule: ScheduleSlotInfo): string {
  const label = schedule.slotLabel?.trim() || 'Slot';
  const windowText =
    schedule.slotTimeWindow?.trim() ||
    (schedule.recommendedTimeWib
      ? `${schedule.recommendedTimeWib.replace(':', '.')} WIB`
      : '');
  return windowText
    ? `${schedule.slotCode} ${label} (${windowText})`
    : `${schedule.slotCode} ${label}`;
}

export function parseTimeToHoursMinutes(timeStr: string): {
  hour: number;
  minute: number;
} {
  const match = (timeStr || '').match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!match) {
    return { hour: 12, minute: 0 };
  }
  const rawHour = Number.parseInt(match[1], 10);
  const rawMinute = Number.parseInt(match[2], 10);
  const hour = Number.isFinite(rawHour)
    ? Math.max(0, Math.min(23, rawHour))
    : 12;
  const minute = Number.isFinite(rawMinute)
    ? Math.max(0, Math.min(59, rawMinute))
    : 0;
  return { hour, minute };
}
