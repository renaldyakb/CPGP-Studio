import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AiContentDisclosureMode } from '@/types/autopost';
import type { PlatformKey } from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
import { IconActionButton } from '../parts/IconActionButton';
import { PlatformIcon } from '../parts/platformMeta';
import {
  resolvePlatformEngine,
  type PlatformSessionCheckResult,
} from '../useAutoPostData';

interface StudioSessionCardDef {
  id: 'yt_shorts' | 'tiktok' | 'meta';
  label: string;
  subtitle: string;
  icons: PlatformKey[];
  platforms: PlatformKey[];
  primaryPlatform: PlatformKey;
}

const STUDIO_SESSION_CARDS: StudioSessionCardDef[] = [
  {
    id: 'yt_shorts',
    label: 'YouTube Studio',
    subtitle: 'YouTube Shorts',
    icons: ['yt_shorts'],
    platforms: ['yt_shorts'],
    primaryPlatform: 'yt_shorts',
  },
  {
    id: 'tiktok',
    label: 'TikTok Studio',
    subtitle: 'TikTok Video',
    icons: ['tiktok'],
    platforms: ['tiktok'],
    primaryPlatform: 'tiktok',
  },
  {
    id: 'meta',
    label: 'Meta Business',
    subtitle: 'Facebook & Instagram Reels',
    icons: ['fb_reels', 'ig_reels'],
    platforms: ['fb_reels', 'ig_reels'],
    primaryPlatform: 'fb_reels',
  },
];

function renderSessionBadge(check?: PlatformSessionCheckResult) {
  if (!check) {
    return <Badge variant="muted">Belum Dicek</Badge>;
  }

  const badgeProps =
    check.state === 'logged_in'
      ? ({ variant: 'success', label: 'Aktif' } as const)
      : check.state === 'logged_out'
        ? ({ variant: 'warning', label: 'Perlu Login' } as const)
        : ({ variant: 'muted', label: 'Belum Dicek' } as const);

  const detail = check.detail?.trim();
  if (!detail) {
    return <Badge variant={badgeProps.variant}>{badgeProps.label}</Badge>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="inline-flex cursor-default rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Badge variant={badgeProps.variant}>{badgeProps.label}</Badge>
      </TooltipTrigger>
      <TooltipContent side="top">{detail}</TooltipContent>
    </Tooltip>
  );
}

export function StudioPage({ ctx }: AutoPostPageProps) {
  const { capabilities, settings, browserSession, sessionChecks, busyKey } =
    ctx.data;
  const browser = settings.browser;

  const isOpen = browserSession.isOpen;
  const anyBrowserAvailable =
    capabilities.chromeAvailable || capabilities.edgeAvailable;
  const isOpeningProfile = busyKey === 'open-profile';
  const isClosingProfile = busyKey === 'close-profile';
  const isCheckingAllSessions = busyKey === 'check-sessions';
  const isCheckingAnySession =
    isCheckingAllSessions || Boolean(busyKey?.startsWith('check-sessions:'));
  const isSavingSettings = busyKey === 'settings';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle>Browser Lokal</CardTitle>
          <Badge variant={isOpen ? 'success' : 'muted'}>
            {isOpen
              ? `Terbuka (${browserSession.openTabsCount} tab)`
              : 'Tertutup'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs font-light text-muted-foreground/75">
            Tanpa API Key. Cukup login sekali di YouTube, TikTok, dan Meta
            Business Suite untuk upload video + cover 9:16 ke 4 platform (FB &amp;
            IG langsung dari Meta Business Suite).
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-light text-muted-foreground/75">
              Terdeteksi
            </span>
            <Badge
              variant={capabilities.chromeAvailable ? 'success' : 'muted'}
              size="sm"
            >
              Chrome
            </Badge>
            <Badge
              variant={capabilities.edgeAvailable ? 'success' : 'muted'}
              size="sm"
            >
              Edge
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="autopost-browser-channel"
                className="block text-xs font-medium text-foreground"
              >
                Channel
              </label>
              <NativeSelect
                id="autopost-browser-channel"
                value={browser.channel}
                disabled={isSavingSettings}
                onChange={(event) => {
                  const channel =
                    event.target.value === 'msedge' ? 'msedge' : 'chrome';
                  void ctx.data.saveSettings({ browser: { channel } });
                }}
                className="w-full"
              >
                <option value="chrome">Google Chrome</option>
                <option value="msedge">Microsoft Edge</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-foreground">
                Folder Profil
              </span>
              <code className="flex min-h-9 items-center truncate rounded-md border border-input bg-muted px-2.5 font-mono text-xs text-foreground">
                {browser.profileDir}
              </code>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="space-y-0.5">
              <label
                htmlFor="autopost-keep-tab"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Tab Tinjau
              </label>
              <p className="text-[11px] font-light text-muted-foreground/75">
                Pertahankan tab studio terbuka saat mode tinjau agar pratinjau
                unggah mudah diperiksa.
              </p>
            </div>
            <Switch
              id="autopost-keep-tab"
              checked={browser.keepTabOpenOnReview}
              disabled={isSavingSettings}
              onCheckedChange={(checked) => {
                void ctx.data.saveSettings({
                  browser: { keepTabOpenOnReview: checked },
                });
              }}
            />
          </div>

          <div className="flex flex-col justify-between gap-2 rounded-md border border-border bg-muted px-3.5 py-2.5 sm:flex-row sm:items-center">
            <div className="space-y-0.5">
              <label
                htmlFor="autopost-ai-disclosure"
                className="block text-xs font-medium text-foreground"
              >
                Label AI-Generated
              </label>
              <p className="text-[11px] font-light text-muted-foreground/75">
                Atur default atau tampilkan dialog konfirmasi tiap kali hendak
                upload otomatis.
              </p>
            </div>
            <NativeSelect
              id="autopost-ai-disclosure"
              value={settings.aiContentDisclosure ?? 'ask'}
              disabled={isSavingSettings}
              onChange={(event) => {
                const raw = event.target.value;
                const next: AiContentDisclosureMode =
                  raw === 'always_ai' || raw === 'always_non_ai' ? raw : 'ask';
                void ctx.data.saveSettings({ aiContentDisclosure: next });
              }}
              className="w-full sm:w-48"
            >
              <option value="ask">Tanya tiap upload</option>
              <option value="always_ai">Selalu tandai AI</option>
              <option value="always_non_ai">Selalu bukan AI</option>
            </NativeSelect>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="editorial"
              disabled={
                isOpeningProfile || isCheckingAnySession || !anyBrowserAvailable
              }
              onClick={() => void ctx.data.openProfile()}
            >
              {isOpeningProfile ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Buka Semua
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                isCheckingAnySession || isOpeningProfile || !anyBrowserAvailable
              }
              onClick={() => void ctx.data.checkStudioSessions()}
            >
              {isCheckingAllSessions ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Cek Sesi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!isOpen || isClosingProfile || isCheckingAnySession}
              onClick={() => void ctx.data.closeProfile()}
            >
              {isClosingProfile ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Tutup
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STUDIO_SESSION_CARDS.map((card) => {
          const engine = resolvePlatformEngine(
            card.primaryPlatform,
            capabilities
          );
          const sessionCheck =
            card.id === 'meta'
              ? (sessionChecks.fb_reels ?? sessionChecks.ig_reels)
              : sessionChecks[card.primaryPlatform];
          const isCheckingThis =
            card.id === 'meta'
              ? busyKey === 'check-sessions:meta'
              : busyKey === `check-sessions:${card.primaryPlatform}`;

          return (
            <Card key={card.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 p-4 pb-2">
                <div className="min-w-0 space-y-0.5">
                  <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="inline-flex shrink-0 items-center gap-1">
                      {card.icons.map((iconKey) => (
                        <PlatformIcon
                          key={iconKey}
                          platform={iconKey}
                          size={15}
                        />
                      ))}
                    </span>
                    <span className="truncate">{card.label}</span>
                  </CardTitle>
                  <p className="truncate text-[11px] font-light text-muted-foreground/75">
                    {card.subtitle}
                  </p>
                </div>
                <Badge variant={engine.variant} size="xs">
                  {engine.label}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2 p-4 pt-1">
                {renderSessionBadge(sessionCheck)}
                <div className="flex shrink-0 items-center gap-1.5">
                  <IconActionButton
                    icon={isCheckingThis ? Loader2 : ShieldCheck}
                    iconClassName={isCheckingThis ? 'animate-spin' : undefined}
                    label={`Cek status login ${card.label}`}
                    variant="outline"
                    disabled={
                      isCheckingAnySession ||
                      isOpeningProfile ||
                      !anyBrowserAvailable
                    }
                    onClick={() =>
                      void ctx.data.checkStudioSessions(card.platforms)
                    }
                  />
                  <IconActionButton
                    icon={ExternalLink}
                    label={`Buka login ${card.label}`}
                    variant="outline"
                    disabled={
                      isOpeningProfile ||
                      isCheckingAnySession ||
                      !anyBrowserAvailable
                    }
                    onClick={() => void ctx.data.openProfile(card.platforms)}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <Accordion>
            <AccordionItem value="login-guide">
              <AccordionTrigger>Panduan login sekali</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1.5 pl-4 text-xs font-light leading-relaxed text-muted-foreground/75">
                  <li>
                    Klik Buka Semua atau tombol buka di kartu platform untuk
                    menjalankan browser profil lokal.
                  </li>
                  <li>
                    Login manual di YouTube, TikTok, dan Meta Business Suite
                    (pastikan akun Instagram sudah terhubung ke Facebook Page);
                    sandi tidak pernah disimpan aplikasi.
                  </li>
                  <li>
                    Klik Cek Sesi untuk memastikan status aktif, lalu klik Tutup
                    agar sesi tersimpan di{' '}
                    <code className="font-mono text-foreground">
                      {browser.profileDir}
                    </code>
                    .
                  </li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
