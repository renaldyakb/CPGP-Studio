import { ExternalLink, Loader2 } from 'lucide-react';
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
import type { AutoPostPageProps } from '../pageProps';
import { IconActionButton } from '../parts/IconActionButton';
import {
  PLATFORM_META,
  PLATFORM_ORDER,
  PlatformIcon,
} from '../parts/platformMeta';
import { resolvePlatformEngine } from '../useAutoPostData';

export function StudioPage({ ctx }: AutoPostPageProps) {
  const { capabilities, settings, browserSession, busyKey } = ctx.data;
  const browser = settings.browser;

  const isOpen = browserSession.isOpen;
  const anyBrowserAvailable =
    capabilities.chromeAvailable || capabilities.edgeAvailable;
  const isOpeningProfile = busyKey === 'open-profile';
  const isClosingProfile = busyKey === 'close-profile';
  const isSavingSettings = busyKey === 'settings';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Browser Lokal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={isOpen ? 'success' : 'muted'}>
              {isOpen
                ? `Sesi terbuka (${browserSession.openTabsCount} tab)`
                : 'Browser tertutup'}
            </Badge>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Browser terdeteksi
              </span>
              <Badge
                variant={capabilities.chromeAvailable ? 'success' : 'muted'}
              >
                Google Chrome
              </Badge>
              <Badge
                variant={capabilities.edgeAvailable ? 'success' : 'muted'}
              >
                Microsoft Edge
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="autopost-browser-channel"
                className="block text-xs font-medium text-foreground"
              >
                Channel browser
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
                Folder profil
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
                Biarkan tab studio terbuka pada mode tinjau
              </label>
              <p className="text-[11px] text-muted-foreground">
                Tab studio tetap terbuka setelah tahap tinjau supaya Anda bisa
                memeriksa pratinjau unggahan sebelum menutup sesi.
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

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="editorial"
              disabled={isOpeningProfile || !anyBrowserAvailable}
              onClick={() => void ctx.data.openProfile()}
            >
              {isOpeningProfile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Buka semua studio
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!isOpen || isClosingProfile}
              onClick={() => void ctx.data.closeProfile()}
            >
              {isClosingProfile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Tutup sesi
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLATFORM_ORDER.map((key) => {
          const meta = PLATFORM_META[key];
          const engine = resolvePlatformEngine(key, capabilities);
          const connected =
            key === 'yt_shorts'
              ? capabilities.youtubeApiReady
              : capabilities.profileInitialized;
          const connectedLabel =
            key === 'yt_shorts'
              ? connected
                ? 'YouTube API terhubung'
                : 'Belum terhubung'
              : connected
                ? 'Login tersimpan'
                : 'Belum login';

          return (
            <Card key={key}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                  <PlatformIcon platform={key} size={16} />
                  <span className="truncate">{meta.label}</span>
                </CardTitle>
                <Badge variant={engine.variant} size="xs">
                  {engine.label}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2 p-4 pt-0">
                <Badge variant={connected ? 'success' : 'muted'}>
                  {connectedLabel}
                </Badge>
                <IconActionButton
                  icon={ExternalLink}
                  label={`Buka login ${meta.label}`}
                  variant="outline"
                  disabled={isOpeningProfile}
                  onClick={() => void ctx.data.openProfile([key])}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          {/* Base UI Accordion: satu item terbuka karena multiple dimatikan, klik ulang menutupnya. */}
          <Accordion>
            <AccordionItem value="login-guide">
              <AccordionTrigger>Panduan login satu kali</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    Buka jendela browser profil khusus lewat tombol Buka semua
                    studio, atau tombol Buka login pada kartu platform yang
                    ingin Anda siapkan.
                  </li>
                  <li>
                    Login manual di setiap platform, termasuk verifikasi dua
                    faktor (2FA) dan captcha. Aplikasi tidak pernah mengisi kata
                    sandi maupun menyimpannya.
                  </li>
                  <li>
                    Setelah semua platform selesai login, tutup sesi lewat
                    tombol Tutup sesi. Cookie tersimpan di folder{' '}
                    <code className="font-mono text-foreground">
                      {browser.profileDir}
                    </code>{' '}
                    dan dipakai lagi pada proses Auto-Post berikutnya.
                  </li>
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Jika sebuah platform menampilkan halaman verifikasi tambahan,
                  selesaikan verifikasi itu secara manual di jendela browser
                  yang terbuka.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
