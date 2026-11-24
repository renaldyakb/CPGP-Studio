import type { ReactNode } from 'react';
import { SiFacebook, SiInstagram, SiTiktok, SiYoutube } from 'react-icons/si';
import type { IconType } from 'react-icons';
import type { PlatformKey } from '@/types/planner';

export interface PlatformMetaInfo {
  key: PlatformKey;
  label: string;
  shortLabel: string;
  Icon: IconType;
  accentClass: string;
}

export const PLATFORM_META: Record<PlatformKey, PlatformMetaInfo> = {
  yt_shorts: {
    key: 'yt_shorts',
    label: 'YouTube Shorts',
    shortLabel: 'YT',
    Icon: SiYoutube,
    accentClass: 'text-[#FF0000]',
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    shortLabel: 'TT',
    Icon: SiTiktok,
    accentClass: 'text-foreground',
  },
  ig_reels: {
    key: 'ig_reels',
    label: 'Instagram Reels',
    shortLabel: 'IG',
    Icon: SiInstagram,
    accentClass: 'text-[#E1306C]',
  },
  fb_reels: {
    key: 'fb_reels',
    label: 'Facebook Reels',
    shortLabel: 'FB',
    Icon: SiFacebook,
    accentClass: 'text-[#1877F2]',
  },
};

export const PLATFORM_ORDER: PlatformKey[] = [
  'yt_shorts',
  'tiktok',
  'ig_reels',
  'fb_reels',
];

export function PlatformIcon({
  platform,
  className,
  size = 14,
}: {
  platform: PlatformKey;
  className?: string;
  size?: number;
}) {
  const { Icon, accentClass, label } = PLATFORM_META[platform];
  return (
    <Icon
      size={size}
      className={className ?? accentClass}
      aria-hidden="true"
      title={label}
    />
  );
}

export function PlatformBadgeIcon({
  platform,
  children,
}: {
  platform: PlatformKey;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PlatformIcon platform={platform} />
      {children}
    </span>
  );
}