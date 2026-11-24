import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { AutoPostPageProps } from '../pageProps';
import type { AutoPostSettingsPatch } from '../useAutoPostData';
import { IconActionButton } from '../parts/IconActionButton';

const YOUTUBE_OAUTH_WINDOW_NAME = 'jurnal-dunia-youtube-oauth';

const YOUTUBE_LINKS = {
  console: 'https://console.cloud.google.com/',
  library: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  credentials: 'https://console.cloud.google.com/apis/credentials',
};

function GuideLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium text-foreground hover:bg-muted"
    >
      <span>{label}</span>
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function StepNumber({ value }: { value: number }) {
  return (
    <span className="mt-0.5 font-mono text-[11px] font-semibold text-foreground">
      {value}
    </span>
  );
}

export function YouTubeApiPage({ ctx }: AutoPostPageProps) {
  const { settings, busyKey } = ctx.data;
  const { youtubeApi } = settings;

  const [enabled, setEnabled] = useState<boolean>(youtubeApi.enabled);
  const [clientId, setClientId] = useState<string>(youtubeApi.clientId);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [redirectUri, setRedirectUri] = useState<string>(
    youtubeApi.redirectUri
  );
  const [copied, setCopied] = useState<boolean>(false);

  const authPopupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setEnabled(youtubeApi.enabled);
  }, [youtubeApi.enabled]);

  useEffect(() => {
    setClientId(youtubeApi.clientId);
  }, [youtubeApi.clientId]);

  useEffect(() => {
    setRedirectUri(youtubeApi.redirectUri);
  }, [youtubeApi.redirectUri]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  const isAuthorizing = busyKey === 'youtube-auth';
  const isDisconnecting = busyKey === 'youtube-disconnect';
  const isSaving = busyKey === 'settings';

  async function handleConnect() {
    const url = await ctx.data.getYouTubeAuthUrl();
    if (!url) return;

    const popup = window.open(
      url,
      YOUTUBE_OAUTH_WINDOW_NAME,
      'width=560,height=700'
    );
    if (!popup) return;

    authPopupRef.current = popup;
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
    }
    pollIntervalRef.current = window.setInterval(() => {
      if (authPopupRef.current && authPopupRef.current.closed) {
        if (pollIntervalRef.current !== null) {
          window.clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        authPopupRef.current = null;
        void ctx.data.refresh();
      }
    }, 900);
  }

  async function handleCopyRedirectUri() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleToggleEnabled(checked: boolean) {
    setEnabled(checked);
    void ctx.data.saveSettings({ youtubeApi: { enabled: checked } });
  }

  async function handleSaveCredentials() {
    const patch: NonNullable<AutoPostSettingsPatch['youtubeApi']> = {
      enabled,
      clientId: clientId.trim(),
      redirectUri: redirectUri.trim(),
    };
    if (clientSecret.trim()) {
      patch.clientSecret = clientSecret.trim();
    }

    const saved = await ctx.data.saveSettings({ youtubeApi: patch });
    if (saved) setClientSecret('');
  }

  const canConnect = Boolean(
    youtubeApi.clientId && youtubeApi.clientSecretConfigured
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle>Status Koneksi</CardTitle>
            <CardDescription>
              Sakelar mesin unggah YouTube dan status akun channel yang
              diotorisasi.
            </CardDescription>
          </div>
          <Badge variant={youtubeApi.connected ? 'success' : 'muted'}>
            {youtubeApi.connected ? 'Terhubung' : 'Belum terhubung'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="space-y-0.5">
              <label
                htmlFor="yt-api-enabled"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Aktifkan YouTube Data API v3
              </label>
              <p className="text-[11px] text-muted-foreground">
                Saat aktif dan terhubung, unggah Shorts berjalan lewat OAuth2
                resmi Google tanpa membuka tab browser.
              </p>
            </div>
            <Switch
              id="yt-api-enabled"
              checked={enabled}
              disabled={isSaving}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {youtubeApi.connected && youtubeApi.channelTitle ? (
            <div className="space-y-0.5 rounded-md border border-border bg-muted px-3 py-2.5">
              <span className="block text-[11px] font-medium text-muted-foreground">
                Channel terhubung
              </span>
              <span className="block truncate font-mono text-xs text-foreground">
                {youtubeApi.channelTitle}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="editorial"
              disabled={isAuthorizing || !canConnect}
              onClick={() => void handleConnect()}
            >
              {isAuthorizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Hubungkan akun YouTube
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!youtubeApi.connected || isDisconnecting}
              onClick={() => void ctx.data.disconnectYouTube()}
            >
              {isDisconnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Putuskan koneksi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kredensial Google Cloud</CardTitle>
          <CardDescription>
            Nilai ini berasal dari OAuth Client tipe Web Application di project
            Google Cloud Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="yt-client-id"
                className="block text-xs font-medium text-foreground"
              >
                Client ID
              </label>
              <Input
                id="yt-client-id"
                type="text"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="yt-client-secret"
                className="block text-xs font-medium text-foreground"
              >
                Client Secret
              </label>
              <Input
                id="yt-client-secret"
                type="password"
                autoComplete="off"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={
                  youtubeApi.clientSecretConfigured
                    ? 'Tersimpan, isi untuk mengganti'
                    : 'GOCSPX-...'
                }
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="yt-redirect-uri"
              className="block text-xs font-medium text-foreground"
            >
              Redirect URI
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                id="yt-redirect-uri"
                type="text"
                readOnly
                value={redirectUri}
                className="flex-1 bg-muted font-mono text-muted-foreground"
              />
              <IconActionButton
                icon={copied ? Check : Copy}
                label={copied ? 'Redirect URI tersalin' : 'Salin redirect URI'}
                onClick={() => void handleCopyRedirectUri()}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              disabled={isSaving}
              onClick={() => void handleSaveCredentials()}
            >
              Simpan kredensial
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Panduan</CardTitle>
          <CardDescription>
            Urutan pembuatan OAuth Client di Google Cloud Console sampai akun
            channel terhubung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Base UI Accordion: tertutup secara default, satu item terbuka karena multiple dimatikan. */}
          <Accordion>
            <AccordionItem value="setup">
              <AccordionTrigger>
                Langkah menghubungkan akun YouTube
              </AccordionTrigger>
              <AccordionContent>
                <ol className="space-y-2">
                  <li className="flex gap-2">
                    <StepNumber value={1} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Buat project di Google Cloud Console.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={2} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Aktifkan YouTube Data API v3 di project tersebut.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={3} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Buat OAuth Client dengan tipe Web Application.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={4} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Tambahkan Redirect URI di atas ke daftar Authorized
                      redirect URIs pada OAuth Client.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={5} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Isi Client ID dan Client Secret di kartu Kredensial Google
                      Cloud, lalu simpan.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={6} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Klik Hubungkan akun YouTube, selesaikan izin di jendela
                      Google, lalu kembali ke halaman ini.
                    </p>
                  </li>
                </ol>

                <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
                  Aplikasi lokal dalam mode testing Google hanya mengizinkan
                  akun yang ditambahkan sebagai test user pada OAuth consent
                  screen.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <GuideLink
                    href={YOUTUBE_LINKS.console}
                    label="Google Cloud Console"
                  />
                  <GuideLink
                    href={YOUTUBE_LINKS.library}
                    label="YouTube Data API v3"
                  />
                  <GuideLink
                    href={YOUTUBE_LINKS.credentials}
                    label="OAuth Credentials"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
