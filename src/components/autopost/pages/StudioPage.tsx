import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AiContentDisclosureMode } from '@/types/autopost';
import type { PlatformKey } from '@/types/planner';
import type { AutoPostPageProps } from '../pageProps';
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

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';
const CHROME_CDP_SHORTCUT_TARGET =
  '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\\Google\\Chrome-CDP"';

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
    label: 'Meta Business Suite',
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

  if (check.state === 'logged_in') {
    return <Badge variant="success">Sesi Aktif</Badge>;
  }
  if (check.state === 'logged_out') {
    return <Badge variant="warning">Perlu Login</Badge>;
  }
  return <Badge variant="muted">Belum Dicek</Badge>;
}

export function StudioPage({ ctx }: AutoPostPageProps) {
  const { capabilities, settings, browserSession, sessionChecks, busyKey } =
    ctx.data;
  const browser = settings.browser;
  const savedCdpUrl = browser.cdpUrl ?? '';
  const [cdpUrlDraft, setCdpUrlDraft] = useState<string>(savedCdpUrl);
  const [isSavingCdp, setIsSavingCdp] = useState<boolean>(false);
  const [copiedShortcut, setCopiedShortcut] = useState<boolean>(false);

  useEffect(() => {
    setCdpUrlDraft(savedCdpUrl);
  }, [savedCdpUrl, browser.profileDir]);

  const isCdpDirty = cdpUrlDraft.trim() !== savedCdpUrl.trim();
  const isCdpConfigured = Boolean(savedCdpUrl.trim());

  const handleSaveCdpUrl = async () => {
    setIsSavingCdp(true);
    try {
      await ctx.data.saveSettings({
        browser: { cdpUrl: cdpUrlDraft.trim() },
      });
    } finally {
      setIsSavingCdp(false);
    }
  };

  const handleCopyShortcut = async () => {
    try {
      await navigator.clipboard.writeText(CHROME_CDP_SHORTCUT_TARGET);
      setCopiedShortcut(true);
      window.setTimeout(() => setCopiedShortcut(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const isOpen = browserSession.isOpen;
  const anyBrowserAvailable =
    capabilities.chromeAvailable ||
    capabilities.edgeAvailable ||
    isCdpConfigured;
  const isOpeningProfile = busyKey === 'open-profile';
  const isClosingProfile = busyKey === 'close-profile';
  const isCheckingAllSessions = busyKey === 'check-sessions';
  const isCheckingAnySession =
    isCheckingAllSessions || Boolean(busyKey?.startsWith('check-sessions:'));
  const isSavingSettings = busyKey === 'settings';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm">Koneksi Browser Studio</CardTitle>
            <p className="text-xs text-muted-foreground">
              Upload video, cover 9:16, dan jadwal tanpa API Key melalui Chrome
              harian (CDP) atau profil lokal terisolasi.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={isCdpConfigured ? 'info' : 'muted'} size="sm">
              {isCdpConfigured ? 'Mode Chrome Harian (CDP)' : 'Profil Terisolasi'}
            </Badge>
            <Badge variant={isOpen ? 'success' : 'muted'} size="sm">
              {isOpen
                ? `Terbuka (${browserSession.openTabsCount} tab)`
                : 'Tertutup'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* CDP Section - Primary recommended setup */}
          <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="autopost-browser-cdp-url"
                className="text-xs font-semibold text-foreground"
              >
                Sambung Chrome Harian (CDP URL)
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {cdpUrlDraft.trim() !== DEFAULT_CDP_URL ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setCdpUrlDraft(DEFAULT_CDP_URL)}
                    className="min-h-9 sm:min-h-7"
                  >
                    Isi {DEFAULT_CDP_URL}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void handleCopyShortcut()}
                  className="min-h-9 sm:min-h-7"
                >
                  {copiedShortcut ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" aria-hidden="true" />
                  )}
                  <span>
                    {copiedShortcut ? 'Target Disalin' : 'Salin Target Shortcut'}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="autopost-browser-cdp-url"
                type="url"
                value={cdpUrlDraft}
                disabled={isSavingCdp}
                onChange={(event) => setCdpUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && isCdpDirty && !isSavingCdp) {
                    event.preventDefault();
                    void handleSaveCdpUrl();
                  }
                }}
                placeholder="http://127.0.0.1:9222"
                className="min-h-10 flex-1 bg-card font-mono text-xs sm:min-h-9"
              />
              <Button
                type="button"
                variant="editorial"
                size="sm"
                disabled={isSavingCdp || !isCdpDirty}
                onClick={() => void handleSaveCdpUrl()}
                className="min-h-10 sm:min-h-9"
              >
                {isSavingCdp ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Simpan CDP
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Disarankan untuk menghindari checkpoint bot: jalankan Chrome harian
              dengan flag <code className="font-mono text-foreground">--remote-debugging-port=9222</code>, lalu masukkan{' '}
              <code className="font-mono text-foreground">http://127.0.0.1:9222</code>. Kosongkan untuk kembali ke profil terisolasi.
            </p>
          </div>

          {/* Browser binary & profile row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="autopost-browser-channel"
                className="block text-xs font-medium text-foreground"
              >
                Browser Fallback (Saat CDP Kosong)
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
                className="min-h-10 w-full sm:min-h-9"
              >
                <option value="chrome">
                  Google Chrome {capabilities.chromeAvailable ? '(Terdeteksi)' : '(Tidak ditemukan)'}
                </option>
                <option value="msedge">
                  Microsoft Edge {capabilities.edgeAvailable ? '(Terdeteksi)' : '(Tidak ditemukan)'}
                </option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-foreground">
                Folder Profil Terisolasi
              </span>
              <code className="flex min-h-10 items-center truncate rounded-md border border-input bg-muted px-2.5 font-mono text-xs text-foreground sm:min-h-9">
                {browser.profileDir}
              </code>
            </div>
          </div>

          {/* Behavior toggles */}
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="space-y-0.5">
                <label
                  htmlFor="autopost-keep-tab"
                  className="cursor-pointer text-xs font-medium text-foreground"
                >
                  Pertahankan Tab Saat Mode Tinjau
                </label>
                <p className="text-xs text-muted-foreground">
                  Biarkan tab studio tetap terbuka saat mode Tinjau agar Anda
                  mudah memeriksa pratinjau unggahan.
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

            <div className="flex flex-col justify-between gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center">
              <div className="space-y-0.5">
                <label
                  htmlFor="autopost-ai-disclosure"
                  className="block text-xs font-medium text-foreground"
                >
                  Default Label AI-Generated
                </label>
                <p className="text-xs text-muted-foreground">
                  Atur jawaban bawaan atau tampilkan dialog konfirmasi setiap
                  kali mengirim konten.
                </p>
              </div>
              <NativeSelect
                id="autopost-ai-disclosure"
                value={settings.aiContentDisclosure ?? 'ask'}
                disabled={isSavingSettings}
                onChange={(event) => {
                  const raw = event.target.value;
                  const next: AiContentDisclosureMode =
                    raw === 'always_ai' || raw === 'always_non_ai'
                      ? raw
                      : 'ask';
                  void ctx.data.saveSettings({ aiContentDisclosure: next });
                }}
                className="min-h-10 w-full sm:min-h-9 sm:w-48"
              >
                <option value="ask">Tanya tiap upload</option>
                <option value="always_ai">Selalu tandai AI</option>
                <option value="always_non_ai">Selalu bukan AI</option>
              </NativeSelect>
            </div>
          </div>

          {/* Primary browser session actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="editorial"
              disabled={
                isOpeningProfile || isCheckingAnySession || !anyBrowserAvailable
              }
              onClick={() => void ctx.data.openProfile()}
              className="min-h-10 sm:min-h-9"
            >
              {isOpeningProfile ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              Buka Semua Studio
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                isCheckingAnySession || isOpeningProfile || !anyBrowserAvailable
              }
              onClick={() => void ctx.data.checkStudioSessions()}
              className="min-h-10 sm:min-h-9"
            >
              {isCheckingAllSessions ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Cek Semua Sesi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!isOpen || isClosingProfile || isCheckingAnySession}
              onClick={() => void ctx.data.closeProfile()}
              className="min-h-10 sm:min-h-9"
            >
              {isClosingProfile ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {isCdpConfigured ? 'Putus Koneksi CDP' : 'Tutup Browser'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-studio session cards */}
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
                  <p className="truncate text-xs text-muted-foreground">
                    {card.subtitle}
                  </p>
                </div>
                <Badge variant={engine.variant} size="xs">
                  {engine.label}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2.5 p-4 pt-1">
                <div className="flex items-center justify-between gap-2">
                  {renderSessionBadge(sessionCheck)}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={
                        isCheckingAnySession ||
                        isOpeningProfile ||
                        !anyBrowserAvailable
                      }
                      onClick={() =>
                        void ctx.data.checkStudioSessions(card.platforms)
                      }
                      className="min-h-9 sm:min-h-7"
                    >
                      {isCheckingThis ? (
                        <Loader2
                          className="size-3 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldCheck className="size-3" aria-hidden="true" />
                      )}
                      <span>Cek</span>
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={
                        isOpeningProfile ||
                        isCheckingAnySession ||
                        !anyBrowserAvailable
                      }
                      onClick={() => void ctx.data.openProfile(card.platforms)}
                      className="min-h-9 sm:min-h-7"
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span>Buka</span>
                    </Button>
                  </div>
                </div>
                {sessionCheck?.detail ? (
                  <p className="text-xs text-muted-foreground">
                    {sessionCheck.detail}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <Accordion>
            <AccordionItem value="login-guide">
              <AccordionTrigger>
                Panduan singkat sambung Chrome harian (CDP)
              </AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    Klik tombol Salin Target Shortcut di atas, lalu tempel pada
                    kolom Target di Properties shortcut Google Chrome Anda.
                  </li>
                  <li>
                    Tutup seluruh jendela Chrome, lalu buka kembali Chrome lewat
                    shortcut tersebut dan login ke YouTube Studio, TikTok
                    Studio, dan Meta Business Suite.
                  </li>
                  <li>
                    Masukkan http://127.0.0.1:9222 pada kolom Sambung Chrome
                    Harian (CDP URL) lalu klik Simpan CDP.
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
