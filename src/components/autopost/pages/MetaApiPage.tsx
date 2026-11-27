import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eraser,
  ExternalLink,
  FlaskConical,
  Loader2,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type {
  AutoPostMetaApiConfig,
  MetaConnectionTestResult,
  MetaDiscoveredPage,
} from '@/types/autopost';
import type { AutoPostPageProps } from '../pageProps';
import { IconActionButton } from '../parts/IconActionButton';

const META_OAUTH_WINDOW_NAME = 'cpgp-meta-oauth';
const DEFAULT_META_REDIRECT_URI =
  'http://localhost:5173/api/autopost/meta/callback';

const META_ALL_PERMISSIONS = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'publish_video',
];

const META_LINKS = {
  apps: 'https://developers.facebook.com/apps/',
  explorer: 'https://developers.facebook.com/tools/explorer/',
  debugger: 'https://developers.facebook.com/tools/debug/accesstoken/',
};

function GuideLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span>{label}</span>
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function StepNumber({ value }: { value: string }) {
  return (
    <span className="mt-0.5 shrink-0 font-mono text-[11px] font-semibold text-foreground">
      {value}
    </span>
  );
}

function formatExpiryDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatCheckedTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed);
}

function resolveTokenBadge(
  tokenType: AutoPostMetaApiConfig['tokenType']
): { label: string; variant: 'success' | 'info' | 'warning' } | null {
  if (tokenType === 'page_permanent') {
    return { label: 'Permanen', variant: 'success' };
  }
  if (tokenType === 'long_lived') {
    return { label: 'Long-Lived', variant: 'info' };
  }
  if (tokenType === 'short_lived') {
    return { label: 'Short-Lived', variant: 'warning' };
  }
  return null;
}

export function MetaApiPage({ ctx }: AutoPostPageProps) {
  const { settings, capabilities, busyKey } = ctx.data;
  const { metaApi } = settings;

  const [appIdDraft, setAppIdDraft] = useState<string>(metaApi.appId);
  const [appSecretDraft, setAppSecretDraft] = useState<string>('');
  const [tokenDraft, setTokenDraft] = useState<string>('');
  const [pages, setPages] = useState<MetaDiscoveredPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [testResult, setTestResult] =
    useState<MetaConnectionTestResult | null>(null);

  const [graphApiVersion, setGraphApiVersion] = useState<string>(
    metaApi.graphApiVersion
  );
  const [igThumbOffsetMs, setIgThumbOffsetMs] = useState<string>(
    String(metaApi.igThumbOffsetMs)
  );
  const [shareToFeed, setShareToFeed] = useState<boolean>(metaApi.shareToFeed);

  const [copiedRedirect, setCopiedRedirect] = useState<boolean>(false);
  const [copiedPermissions, setCopiedPermissions] = useState<boolean>(false);

  const authPopupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);
  const permTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setAppIdDraft(metaApi.appId);
  }, [metaApi.appId]);

  useEffect(() => {
    setGraphApiVersion(metaApi.graphApiVersion);
  }, [metaApi.graphApiVersion]);

  useEffect(() => {
    setIgThumbOffsetMs(String(metaApi.igThumbOffsetMs));
  }, [metaApi.igThumbOffsetMs]);

  useEffect(() => {
    setShareToFeed(metaApi.shareToFeed);
  }, [metaApi.shareToFeed]);

  // Reset transient drafts and discovered pages when switching workspace
  useEffect(() => {
    setPages([]);
    setSelectedPageId(null);
    setTestResult(null);
    setAppSecretDraft('');
    setTokenDraft('');
  }, [settings.browser.profileDir]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      if (permTimeoutRef.current !== null) {
        window.clearTimeout(permTimeoutRef.current);
        permTimeoutRef.current = null;
      }
    };
  }, []);

  const isExchanging = busyKey === 'meta-exchange';
  const isDiscovering = busyKey === 'meta-discover';
  const isTesting = busyKey === 'meta-test';
  const isAuthorizing = busyKey === 'meta-auth';
  const isDisconnecting = busyKey === 'meta-disconnect';
  const isSaving = busyKey === 'settings';

  const redirectUri = metaApi.redirectUri || DEFAULT_META_REDIRECT_URI;
  const isConfigured = Boolean(
    metaApi.accessTokenConfigured ||
      metaApi.pageAccessTokenConfigured ||
      metaApi.pageId ||
      metaApi.igUserId
  );
  const canUseOAuth = Boolean(
    (appIdDraft.trim() || metaApi.appId) &&
      (appSecretDraft.trim() || metaApi.appSecretConfigured)
  );
  const canExchange = Boolean(
    tokenDraft.trim() &&
      (appIdDraft.trim() || metaApi.appId) &&
      (appSecretDraft.trim() || metaApi.appSecretConfigured)
  );

  const selectedPage =
    pages.find((page) => page.pageId === selectedPageId) ?? null;
  const tokenBadge = resolveTokenBadge(metaApi.tokenType);
  const formattedTokenExpiry = formatExpiryDate(metaApi.tokenExpiresAt);

  async function handleTestConnection() {
    const result = await ctx.data.testMetaConnection();
    if (result) {
      setTestResult(result);
    }
  }

  async function handleExchangeToken() {
    if (!tokenDraft.trim()) return;
    const result = await ctx.data.exchangeMetaToken({
      appId: appIdDraft.trim() || undefined,
      appSecret: appSecretDraft.trim() || undefined,
      shortLivedToken: tokenDraft.trim(),
    });
    if (!result) return;

    setTokenDraft('');
    setAppSecretDraft('');
    setTestResult(null);
    setPages(result.pages);
    if (result.autoSelectedPage) {
      setSelectedPageId(result.autoSelectedPage.pageId);
    } else if (result.pages.length > 0) {
      setSelectedPageId(result.pages[0].pageId);
    } else {
      setSelectedPageId(null);
    }
  }

  async function handleDiscover() {
    const result = await ctx.data.discoverMeta(tokenDraft);
    if (!result) return;
    setPages(result);
    const match = result.find((page) => page.pageId === metaApi.pageId);
    setSelectedPageId(match ? match.pageId : (result[0]?.pageId ?? null));
  }

  async function handleUsePage() {
    if (!selectedPage) return;
    await ctx.data.saveSettings({
      metaApi: {
        pageId: selectedPage.pageId,
        pageName: selectedPage.pageName,
        igUserId: selectedPage.igUserId ?? '',
        igUsername: selectedPage.igUsername,
      },
    });
    setTestResult(null);
  }

  async function handleOAuthLogin() {
    const trimmedAppId = appIdDraft.trim();
    const trimmedSecret = appSecretDraft.trim();
    const needsSave =
      trimmedAppId !== metaApi.appId || trimmedSecret.length > 0;

    if (needsSave) {
      const saved = await ctx.data.saveSettings({
        metaApi: {
          appId: trimmedAppId,
          ...(trimmedSecret ? { appSecret: trimmedSecret } : {}),
        },
      });
      if (!saved) return;
      if (trimmedSecret) setAppSecretDraft('');
    }

    const url = await ctx.data.getMetaAuthUrl();
    if (!url) return;

    const popup = window.open(
      url,
      META_OAUTH_WINDOW_NAME,
      'width=600,height=720'
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
        setTestResult(null);
        void ctx.data.refresh();
      }
    }, 900);
  }

  async function handleCopyRedirectUri() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopiedRedirect(true);
      if (redirectTimeoutRef.current !== null) {
        window.clearTimeout(redirectTimeoutRef.current);
      }
      redirectTimeoutRef.current = window.setTimeout(() => {
        setCopiedRedirect(false);
        redirectTimeoutRef.current = null;
      }, 1600);
    } catch {
      setCopiedRedirect(false);
    }
  }

  async function handleCopyPermissions() {
    try {
      await navigator.clipboard.writeText(META_ALL_PERMISSIONS.join(', '));
      setCopiedPermissions(true);
      if (permTimeoutRef.current !== null) {
        window.clearTimeout(permTimeoutRef.current);
      }
      permTimeoutRef.current = window.setTimeout(() => {
        setCopiedPermissions(false);
        permTimeoutRef.current = null;
      }, 1600);
    } catch {
      setCopiedPermissions(false);
    }
  }

  async function handleSaveOptions() {
    const parsedOffset = Number(igThumbOffsetMs);
    await ctx.data.saveSettings({
      metaApi: {
        graphApiVersion: graphApiVersion.trim() || metaApi.graphApiVersion,
        igThumbOffsetMs: Number.isFinite(parsedOffset)
          ? parsedOffset
          : metaApi.igThumbOffsetMs,
        shareToFeed,
      },
    });
  }

  async function handleDisconnect() {
    await ctx.data.disconnectMeta();
    setPages([]);
    setSelectedPageId(null);
    setTestResult(null);
    setTokenDraft('');
  }

  const testExpiryLabel = testResult
    ? testResult.permissions.isNeverExpiring
      ? 'Expires: Never'
      : testResult.permissions.tokenExpiresAt
        ? `Expires: ${formatExpiryDate(testResult.permissions.tokenExpiresAt)}`
        : 'Masa berlaku tidak diketahui'
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle>Status Koneksi</CardTitle>
            <CardDescription className="text-muted-foreground">
              Status mesin unggah Meta Graph API untuk Facebook Reels dan
              Instagram Reels.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={capabilities.metaFbApiReady ? 'success' : 'muted'}
              size="sm"
            >
              {capabilities.metaFbApiReady ? 'FB: Siap' : 'FB: Belum'}
            </Badge>
            <Badge
              variant={capabilities.metaIgApiReady ? 'success' : 'muted'}
              size="sm"
            >
              {capabilities.metaIgApiReady ? 'IG: Siap' : 'IG: Belum'}
            </Badge>
            <label
              htmlFor="meta-api-enabled"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              <span>Aktifkan Meta API</span>
              <Switch
                id="meta-api-enabled"
                checked={metaApi.enabled}
                disabled={isSaving}
                onCheckedChange={(checked) => {
                  void ctx.data.saveSettings({ metaApi: { enabled: checked } });
                }}
              />
            </label>
          </div>
        </CardHeader>

        <CardContent className="space-y-3.5">
          {isConfigured ? (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/50 px-3.5 py-2.5 sm:grid-cols-3">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-[11px] text-muted-foreground">
                  Facebook Page
                </span>
                <span className="block truncate font-mono text-xs text-foreground">
                  {metaApi.pageName || metaApi.pageId || 'Belum diatur'}
                </span>
              </div>
              <div className="min-w-0 space-y-0.5">
                <span className="block text-[11px] text-muted-foreground">
                  Instagram Business
                </span>
                <span className="block truncate font-mono text-xs text-foreground">
                  {metaApi.igUsername
                    ? `@${metaApi.igUsername}`
                    : metaApi.igUserId || 'Belum tertaut'}
                </span>
              </div>
              <div className="min-w-0 space-y-1">
                <span className="block text-[11px] text-muted-foreground">
                  Status Token
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {tokenBadge ? (
                    <Badge variant={tokenBadge.variant} size="xs">
                      {tokenBadge.label}
                    </Badge>
                  ) : (
                    <Badge variant="muted" size="xs">
                      Tersimpan
                    </Badge>
                  )}
                  {metaApi.tokenType === 'page_permanent' ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Never expires
                    </span>
                  ) : formattedTokenExpiry ? (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      s/d {formattedTokenExpiry}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Belum ada token Meta yang terhubung. Isi kredensial di bawah dan
              tukar token untuk mulai menggunakan API resmi.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTesting || !isConfigured}
              onClick={() => void handleTestConnection()}
            >
              {isTesting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Tes Koneksi FB &amp; IG
            </Button>

            {testResult ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                Diperiksa {formatCheckedTime(testResult.checkedAt)} ·{' '}
                {testResult.graphApiVersion}
              </span>
            ) : null}
          </div>

          {testResult ? (
            <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2">
                  {testResult.fbPage.ok ? (
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#166534] dark:text-[#86efac]"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertCircle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#991b1b] dark:text-[#fca5a5]"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">
                        Facebook Page
                      </span>
                      <Badge
                        variant={
                          testResult.fbPage.ok ? 'success' : 'destructive'
                        }
                        size="xs"
                      >
                        {testResult.fbPage.ok ? 'OK' : 'Gagal'}
                      </Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {testResult.fbPage.ok
                        ? `${testResult.fbPage.pageName || 'Page'} · ${testResult.fbPage.pageId}`
                        : testResult.fbPage.error || 'Page belum terhubung'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2">
                  {testResult.igAccount.ok ? (
                    <CheckCircle2
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#166534] dark:text-[#86efac]"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertCircle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#991b1b] dark:text-[#fca5a5]"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">
                        Instagram Business
                      </span>
                      <Badge
                        variant={
                          testResult.igAccount.ok ? 'success' : 'destructive'
                        }
                        size="xs"
                      >
                        {testResult.igAccount.ok ? 'OK' : 'Gagal'}
                      </Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {testResult.igAccount.ok
                        ? `@${testResult.igAccount.username || testResult.igAccount.igUserId}${
                            testResult.igAccount.mediaCount !== null
                              ? ` · ${testResult.igAccount.mediaCount} post`
                              : ''
                          }`
                        : testResult.igAccount.error ||
                          'Akun Instagram belum tertaut'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    Izin &amp; Token
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        testResult.permissions.isNeverExpiring
                          ? 'success'
                          : 'info'
                      }
                      size="xs"
                    >
                      {testExpiryLabel}
                    </Badge>
                    <Badge variant="muted" size="xs">
                      {testResult.permissions.granted.length} izin aktif
                    </Badge>
                  </div>
                </div>

                {testResult.permissions.missingIg.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-[#991b1b] dark:text-[#fca5a5]">
                      Kurang izin IG:
                    </span>
                    {testResult.permissions.missingIg.map((perm) => (
                      <Badge
                        key={perm}
                        variant="destructive"
                        size="xs"
                        className="font-mono"
                      >
                        {perm}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {testResult.permissions.missingFb.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-[#92400e] dark:text-[#fcd34d]">
                      Kurang izin FB:
                    </span>
                    {testResult.permissions.missingFb.map((perm) => (
                      <Badge
                        key={perm}
                        variant="warning"
                        size="xs"
                        className="font-mono"
                      >
                        {perm}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kredensial Meta App &amp; Token</CardTitle>
          <CardDescription className="text-muted-foreground">
            Masukkan App ID dan App Secret dari Meta Developer, lalu tukar
            short-lived token (EAA...) menjadi Long-Lived dan Page Token
            permanen dalam satu klik.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="meta-app-id"
                className="block text-xs font-medium text-foreground"
              >
                App ID
              </label>
              <Input
                id="meta-app-id"
                type="text"
                autoComplete="off"
                value={appIdDraft}
                onChange={(event) => setAppIdDraft(event.target.value)}
                placeholder="123456789012345"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="meta-app-secret"
                className="block text-xs font-medium text-foreground"
              >
                App Secret
              </label>
              <Input
                id="meta-app-secret"
                type="password"
                autoComplete="off"
                value={appSecretDraft}
                onChange={(event) => setAppSecretDraft(event.target.value)}
                placeholder={
                  metaApi.appSecretConfigured
                    ? 'Tersimpan di backend, isi untuk ganti'
                    : 'Masukkan App Secret dari Meta App'
                }
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="meta-redirect-uri"
              className="block text-xs font-medium text-foreground"
            >
              Valid OAuth Redirect URI
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-1.5">
                <Input
                  id="meta-redirect-uri"
                  type="text"
                  readOnly
                  value={redirectUri}
                  className="flex-1 bg-muted font-mono text-muted-foreground"
                />
                <IconActionButton
                  icon={copiedRedirect ? Check : Copy}
                  label={
                    copiedRedirect
                      ? 'Redirect URI tersalin'
                      : 'Salin Redirect URI'
                  }
                  variant="outline"
                  onClick={() => void handleCopyRedirectUri()}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canUseOAuth || isAuthorizing || isSaving}
                onClick={() => void handleOAuthLogin()}
              >
                {isAuthorizing ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Login OAuth Meta
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label
              htmlFor="meta-access-token"
              className="block text-xs font-medium text-foreground"
            >
              Short-Lived / Access Token (EAA...)
            </label>
            <Input
              id="meta-access-token"
              type="password"
              autoComplete="off"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder={
                metaApi.accessTokenConfigured
                  ? 'Token tersimpan di backend, tempel token baru untuk ganti'
                  : 'Tempel token EAA... dari Graph API Explorer'
              }
              className="font-mono"
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                type="button"
                variant="editorial"
                disabled={isExchanging || !canExchange}
                onClick={() => void handleExchangeToken()}
              >
                {isExchanging ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Tukar Long-Lived &amp; Ambil Page/IG
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  isDiscovering ||
                  (!tokenDraft.trim() && !metaApi.accessTokenConfigured)
                }
                onClick={() => void handleDiscover()}
              >
                {isDiscovering ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Deteksi Saja
              </Button>
              <IconActionButton
                icon={Eraser}
                label="Kosongkan"
                variant="ghost"
                disabled={tokenDraft.length === 0}
                onClick={() => setTokenDraft('')}
              />
            </div>
            <p className="text-[11px] font-light leading-relaxed text-muted-foreground">
              {tokenDraft.trim() && !canUseOAuth
                ? 'Isi App ID dan App Secret di atas agar tombol Tukar Long-Lived dapat digunakan, atau gunakan Deteksi Saja untuk token yang sudah Long-Lived.'
                : 'Tombol Tukar Long-Lived menjalankan Langkah 5 dan 6 otomatis: memperpanjang token Explorer menjadi 60 hari, mengambil Page Token permanen, lalu memuat Page ID dan IG User ID.'}
            </p>
          </div>

          {pages.length > 0 ? (
            <div className="space-y-2.5 pt-1">
              <p className="text-xs font-medium text-foreground">
                Pilih Facebook Page &amp; Instagram Business ({pages.length})
              </p>
              <div
                role="radiogroup"
                aria-label="Pilih akun Meta"
                className="space-y-1.5"
              >
                {pages.map((page) => {
                  const selected = page.pageId === selectedPageId;
                  return (
                    <Button
                      key={page.pageId}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      variant={selected ? 'secondary' : 'outline'}
                      className="h-auto w-full flex-col items-start justify-start gap-0.5 px-3 py-2 text-left"
                      onClick={() => setSelectedPageId(page.pageId)}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate whitespace-normal text-xs font-medium text-foreground">
                          {page.pageName}
                        </span>
                        {page.hasPageToken ? (
                          <Badge variant="success" size="xs">
                            Page Token
                          </Badge>
                        ) : null}
                      </div>
                      <span className="whitespace-normal font-mono text-[11px] text-muted-foreground">
                        Page ID: {page.pageId} ·{' '}
                        {page.igUsername
                          ? `IG: @${page.igUsername}`
                          : 'Instagram belum tertaut'}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {selectedPage && !selectedPage.igUserId ? (
                <p className="text-[11px] text-muted-foreground">
                  Page ini belum memiliki akun Instagram Business tertaut.
                  Facebook Reels tetap bisa dipakai.
                </p>
              ) : null}

              <Button
                type="button"
                variant="editorial"
                size="sm"
                disabled={!selectedPage || isSaving}
                onClick={() => void handleUsePage()}
              >
                Gunakan Page Ini
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-4 py-1.5">
          <Accordion>
            <AccordionItem value="advanced-options">
              <AccordionTrigger className="text-sm font-semibold">
                Opsi Lanjutan
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="meta-graph-version"
                        className="block text-xs font-medium text-foreground"
                      >
                        Versi Graph API
                      </label>
                      <Input
                        id="meta-graph-version"
                        type="text"
                        value={graphApiVersion}
                        onChange={(event) =>
                          setGraphApiVersion(event.target.value)
                        }
                        placeholder="v25.0"
                        className="font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="meta-thumb-offset"
                        className="block text-xs font-medium text-foreground"
                      >
                        Frame Cover IG (ms)
                      </label>
                      <Input
                        id="meta-thumb-offset"
                        type="number"
                        min={0}
                        step={100}
                        value={igThumbOffsetMs}
                        onChange={(event) =>
                          setIgThumbOffsetMs(event.target.value)
                        }
                        placeholder="1000"
                        className="font-mono"
                      />
                      <span className="block text-[11px] text-muted-foreground">
                        Contoh: 1000 berarti frame pada detik pertama video.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-3.5 py-2.5">
                    <div className="space-y-0.5">
                      <label
                        htmlFor="meta-share-to-feed"
                        className="cursor-pointer text-xs font-medium text-foreground"
                      >
                        Bagikan ke Feed
                      </label>
                      <span className="block text-[11px] text-muted-foreground">
                        Tampilkan Instagram Reels di grid profil selain di tab
                        Reels.
                      </span>
                    </div>
                    <Switch
                      id="meta-share-to-feed"
                      checked={shareToFeed}
                      onCheckedChange={setShareToFeed}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => void handleSaveOptions()}
                    >
                      Simpan Opsi
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!isConfigured || isDisconnecting}
                      onClick={() => void handleDisconnect()}
                    >
                      {isDisconnecting ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : null}
                      Putuskan &amp; Hapus Token
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Panduan Sambungkan Meta API (Langkah 0 - 8)</CardTitle>
          <CardDescription className="text-muted-foreground">
            Ikuti urutan ini sebelum membuat token. Akun Instagram yang belum
            siap akan membuat token gagal dipakai publish.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Accordion>
            <AccordionItem value="step-0">
              <AccordionTrigger className="text-xs font-medium">
                Langkah 0: Syarat Akun (Wajib Sebelum Mulai)
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground/85">
                  <ol className="space-y-2">
                    <li className="flex gap-2">
                      <StepNumber value="1." />
                      <span>
                        Akun Instagram wajib bertipe{' '}
                        <strong className="font-medium text-foreground">
                          Business atau Creator
                        </strong>
                        , bukan Personal. Di Instagram buka{' '}
                        <code className="font-mono text-foreground">
                          Settings &gt; Account type and tools &gt; Switch to
                          professional account
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <StepNumber value="2." />
                      <span>
                        Instagram wajib terhubung ke{' '}
                        <strong className="font-medium text-foreground">
                          Facebook Page
                        </strong>
                        . Tautkan dari IG lewat{' '}
                        <code className="font-mono text-foreground">
                          Settings &gt; Account &gt; Linked accounts &gt;
                          Facebook Page
                        </code>{' '}
                        atau dari Facebook Page lewat{' '}
                        <code className="font-mono text-foreground">
                          Settings &gt; Linked Accounts &gt; Instagram
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <StepNumber value="3." />
                      <span>
                        Akun Facebook Anda wajib berstatus{' '}
                        <strong className="font-medium text-foreground">
                          Admin
                        </strong>{' '}
                        di Facebook Page tersebut.
                      </span>
                    </li>
                  </ol>
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] font-light text-muted-foreground/80">
                    Instagram publishing lewat API meminjam akses Facebook Page.
                    Jika IG belum terhubung ke Page, API tidak dapat melakukan
                    publish.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-1-3">
              <AccordionTrigger className="text-xs font-medium">
                Langkah 1 - 3: Buat App, Catat App ID/Secret &amp; Tambah Produk
              </AccordionTrigger>
              <AccordionContent>
                <ol className="space-y-2 text-xs leading-relaxed text-muted-foreground/85">
                  <li className="flex gap-2">
                    <StepNumber value="1." />
                    <span>
                      Buka{' '}
                      <code className="font-mono text-foreground">
                        developers.facebook.com
                      </code>
                      , login dengan akun Facebook Anda, lalu daftar sebagai
                      Meta Developer (gratis).
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value="2." />
                    <span>
                      Klik{' '}
                      <code className="font-mono text-foreground">
                        My Apps &gt; Create App
                      </code>
                      , pilih tipe{' '}
                      <strong className="font-medium text-foreground">
                        Business
                      </strong>
                      , isi nama app (misal Studio Konten Auto Post) dan email
                      kontak. Catat{' '}
                      <strong className="font-medium text-foreground">
                        App ID
                      </strong>{' '}
                      dan{' '}
                      <strong className="font-medium text-foreground">
                        App Secret
                      </strong>
                      , lalu simpan di kartu Kredensial di atas (App Secret
                      hanya disimpan di backend lokal).
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value="3." />
                    <span>
                      Di dashboard App, klik{' '}
                      <code className="font-mono text-foreground">
                        Add Product
                      </code>{' '}
                      dan tambahkan{' '}
                      <strong className="font-medium text-foreground">
                        Facebook Login for Business
                      </strong>{' '}
                      serta{' '}
                      <strong className="font-medium text-foreground">
                        Instagram Graph API
                      </strong>
                      . Pada pengaturan OAuth, isi Valid OAuth Redirect URIs
                      dengan{' '}
                      <code className="font-mono text-foreground">
                        {DEFAULT_META_REDIRECT_URI}
                      </code>
                      .
                    </span>
                  </li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-4-6">
              <AccordionTrigger className="text-xs font-medium">
                Langkah 4 - 6: Ambil Token di Graph API Explorer -&gt; Tukar
                Otomatis ke Long-Lived
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground/85">
                  <ol className="space-y-2">
                    <li className="flex gap-2">
                      <StepNumber value="4." />
                      <span>
                        Buka{' '}
                        <code className="font-mono text-foreground">
                          developers.facebook.com/tools/explorer
                        </code>
                        , pilih App Anda di kanan atas, lalu klik{' '}
                        <strong className="font-medium text-foreground">
                          Generate Access Token
                        </strong>{' '}
                        dan centang 7 permission berikut:
                      </span>
                    </li>
                  </ol>

                  <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {META_ALL_PERMISSIONS.map((perm) => (
                        <Badge
                          key={perm}
                          variant="outline"
                          size="xs"
                          className="font-mono"
                        >
                          {perm}
                        </Badge>
                      ))}
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => void handleCopyPermissions()}
                      >
                        {copiedPermissions ? (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                        {copiedPermissions
                          ? 'Daftar permission tersalin'
                          : 'Salin daftar permission'}
                      </Button>
                    </div>
                  </div>

                  <ol className="space-y-2">
                    <li className="flex gap-2">
                      <StepNumber value="5-6." />
                      <span>
                        Login, pilih Facebook Page Anda, lalu salin token{' '}
                        <code className="font-mono text-foreground">
                          EAA...
                        </code>{' '}
                        (short-lived 1-2 jam) ke kolom token di atas dan klik{' '}
                        <strong className="font-medium text-foreground">
                          Tukar Long-Lived &amp; Ambil Page/IG
                        </strong>
                        . CPGP otomatis menjalankan{' '}
                        <code className="font-mono text-foreground">
                          fb_exchange_token
                        </code>{' '}
                        (60 hari), mengambil{' '}
                        <code className="font-mono text-foreground">
                          PAGE_ACCESS_TOKEN
                        </code>{' '}
                        permanen,{' '}
                        <code className="font-mono text-foreground">
                          PAGE_ID
                        </code>
                        , dan{' '}
                        <code className="font-mono text-foreground">
                          IG_USER_ID
                        </code>{' '}
                        dalam 1 klik.
                      </span>
                    </li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-7-8">
              <AccordionTrigger className="text-xs font-medium">
                Langkah 7 - 8: Tes 1x Dulu &amp; Mode Development vs Publik
              </AccordionTrigger>
              <AccordionContent>
                <ol className="space-y-2 text-xs leading-relaxed text-muted-foreground/85">
                  <li className="flex gap-2">
                    <StepNumber value="7." />
                    <span>
                      Sebelum mulai auto-post, klik tombol{' '}
                      <strong className="font-medium text-foreground">
                        Tes Koneksi FB &amp; IG
                      </strong>{' '}
                      pada kartu Status Koneksi di atas untuk memastikan
                      Facebook Page, akun Instagram Business, masa berlaku
                      token, dan seluruh permission sudah aktif.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value="8." />
                    <span>
                      Jika App ini hanya untuk Facebook Page dan Instagram milik
                      Anda sendiri, cukup gunakan mode{' '}
                      <strong className="font-medium text-foreground">
                        Development
                      </strong>{' '}
                      dengan akun Anda sebagai Admin atau Tester. Jika kelak
                      dipakai pengguna publik lain, App wajib melewati{' '}
                      <strong className="font-medium text-foreground">
                        Meta App Review
                      </strong>{' '}
                      disertai video demo penggunaan izin publish.
                    </span>
                  </li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <GuideLink href={META_LINKS.apps} label="Meta Apps" />
            <GuideLink href={META_LINKS.explorer} label="Graph API Explorer" />
            <GuideLink
              href={META_LINKS.debugger}
              label="Access Token Debugger"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
