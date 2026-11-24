import { useEffect, useState } from 'react';
import { Eraser, ExternalLink, Loader2 } from 'lucide-react';
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
import type { MetaDiscoveredPage } from '@/types/autopost';
import type { AutoPostPageProps } from '../pageProps';
import { IconActionButton } from '../parts/IconActionButton';

const META_GRAPH_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
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

export function MetaApiPage({ ctx }: AutoPostPageProps) {
  const { settings, capabilities, busyKey } = ctx.data;
  const { metaApi } = settings;

  const [tokenDraft, setTokenDraft] = useState<string>('');
  const [pages, setPages] = useState<MetaDiscoveredPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [graphApiVersion, setGraphApiVersion] = useState<string>(
    metaApi.graphApiVersion
  );
  const [igThumbOffsetMs, setIgThumbOffsetMs] = useState<string>(
    String(metaApi.igThumbOffsetMs)
  );
  const [shareToFeed, setShareToFeed] = useState<boolean>(metaApi.shareToFeed);

  useEffect(() => {
    setGraphApiVersion(metaApi.graphApiVersion);
  }, [metaApi.graphApiVersion]);

  useEffect(() => {
    setIgThumbOffsetMs(String(metaApi.igThumbOffsetMs));
  }, [metaApi.igThumbOffsetMs]);

  useEffect(() => {
    setShareToFeed(metaApi.shareToFeed);
  }, [metaApi.shareToFeed]);

  const isDiscovering = busyKey === 'meta-discover';
  const isDisconnecting = busyKey === 'meta-disconnect';
  const isSaving = busyKey === 'settings';

  const isReady = capabilities.metaFbApiReady || capabilities.metaIgApiReady;
  const isConfigured = Boolean(
    metaApi.accessTokenConfigured || metaApi.pageId || metaApi.igUserId
  );

  const selectedPage =
    pages.find((page) => page.pageId === selectedPageId) ?? null;

  async function handleDiscover() {
    const result = await ctx.data.discoverMeta(tokenDraft);
    if (!result) return;
    setPages(result);
    const match = result.find((page) => page.pageId === metaApi.pageId);
    setSelectedPageId(match ? match.pageId : null);
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle>Status Koneksi</CardTitle>
            <CardDescription>
              Kesiapan API per platform dan sakelar mesin unggah Meta.
            </CardDescription>
          </div>
          <Badge variant={isReady ? 'success' : 'warning'}>
            {isReady ? 'Siap' : 'Belum siap'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
              <dt className="text-xs font-medium text-foreground">
                Facebook Reels
              </dt>
              <dd>
                <Badge
                  variant={capabilities.metaFbApiReady ? 'success' : 'muted'}
                >
                  {capabilities.metaFbApiReady ? 'Siap' : 'Belum siap'}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
              <dt className="text-xs font-medium text-foreground">
                Instagram Reels
              </dt>
              <dd>
                <Badge
                  variant={capabilities.metaIgApiReady ? 'success' : 'muted'}
                >
                  {capabilities.metaIgApiReady ? 'Siap' : 'Belum siap'}
                </Badge>
              </dd>
            </div>
          </dl>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="space-y-0.5">
              <label
                htmlFor="meta-api-enabled"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Aktifkan Meta Graph API
              </label>
              <p className="text-[11px] text-muted-foreground">
                Saat aktif dan siap, unggah Facebook Reels dan Instagram Reels
                berjalan lewat API resmi Meta tanpa membuka jendela browser.
              </p>
            </div>
            <Switch
              id="meta-api-enabled"
              checked={metaApi.enabled}
              disabled={isSaving}
              onCheckedChange={(checked) => {
                void ctx.data.saveSettings({ metaApi: { enabled: checked } });
              }}
            />
          </div>

          {isConfigured ? (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted px-3 py-2.5 sm:grid-cols-2">
              <div className="space-y-0.5">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  Halaman Facebook
                </span>
                <span className="block truncate font-mono text-xs text-foreground">
                  {metaApi.pageName || metaApi.pageId || 'Belum diatur'}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="block text-[11px] font-medium text-muted-foreground">
                  Akun Instagram
                </span>
                <span className="block truncate font-mono text-xs text-foreground">
                  {metaApi.igUsername
                    ? `@${metaApi.igUsername}`
                    : metaApi.igUserId || 'Belum tertaut'}
                </span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kredensial &amp; Akun</CardTitle>
          <CardDescription>
            Tempel token Meta, deteksi Page dan akun Instagram Business yang
            tertaut, lalu simpan pasangan akun yang dipakai untuk unggah.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="meta-access-token"
              className="block text-xs font-medium text-foreground"
            >
              Meta Access Token (User, System, atau Page Token)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="meta-access-token"
                type="password"
                autoComplete="off"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder={
                  metaApi.accessTokenConfigured
                    ? 'Token tersimpan, isi untuk mengganti'
                    : 'EAA...'
                }
                className="flex-1 font-mono"
              />
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="default"
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
                  Deteksi akun
                </Button>
                <IconActionButton
                  icon={Eraser}
                  label="Kosongkan kolom token"
                  disabled={tokenDraft.length === 0}
                  onClick={() => setTokenDraft('')}
                />
              </div>
            </div>
          </div>

          {pages.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Akun terdeteksi
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
                      <span className="whitespace-normal text-xs font-medium text-foreground">
                        {page.pageName}
                      </span>
                      <span className="whitespace-normal font-mono text-[11px] text-muted-foreground">
                        {page.pageId}
                      </span>
                      <span className="whitespace-normal font-mono text-[11px] text-muted-foreground">
                        {page.igUsername
                          ? `@${page.igUsername}`
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
                disabled={!selectedPage || isSaving}
                onClick={() => void handleUsePage()}
              >
                Gunakan akun ini
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opsi Lanjutan</CardTitle>
          <CardDescription>
            Penyesuaian permintaan Graph API dan perilaku unggah Instagram
            Reels.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                onChange={(event) => setGraphApiVersion(event.target.value)}
                placeholder="v25.0"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="meta-thumb-offset"
                className="block text-xs font-medium text-foreground"
              >
                Frame cover Instagram (ms)
              </label>
              <Input
                id="meta-thumb-offset"
                type="number"
                min={0}
                step={100}
                value={igThumbOffsetMs}
                onChange={(event) => setIgThumbOffsetMs(event.target.value)}
                placeholder="1000"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Contoh: 1000 berarti detik pertama video
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3.5 py-2.5">
            <div className="space-y-0.5">
              <label
                htmlFor="meta-share-to-feed"
                className="cursor-pointer text-xs font-medium text-foreground"
              >
                Bagikan Instagram Reels ke feed
              </label>
              <p className="text-[11px] text-muted-foreground">
                Tampilkan Reels di grid profil Instagram selain di tab Reels.
              </p>
            </div>
            <Switch
              id="meta-share-to-feed"
              checked={shareToFeed}
              onCheckedChange={setShareToFeed}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              disabled={isSaving}
              onClick={() => void handleSaveOptions()}
            >
              Simpan opsi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Panduan</CardTitle>
          <CardDescription>
            Dua jalur pengambilan token Meta: lewat Graph API Explorer atau
            System User di Business Portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Base UI Accordion: tertutup secara default, satu item terbuka karena multiple dimatikan. */}
          <Accordion>
            <AccordionItem value="explorer">
              <AccordionTrigger>
                Cara cepat lewat Graph API Explorer
              </AccordionTrigger>
              <AccordionContent>
                <ol className="space-y-2">
                  <li className="flex gap-2">
                    <StepNumber value={1} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Buat Meta App di{' '}
                      <code className="font-mono text-foreground">
                        developers.facebook.com/apps
                      </code>{' '}
                      dengan tipe Business, lalu hubungkan ke Business
                      Portfolio.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={2} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Buka{' '}
                      <code className="font-mono text-foreground">
                        developers.facebook.com/tools/explorer
                      </code>
                      , pilih Meta App Anda, lalu klik Get User Access Token dan
                      centang izin{' '}
                      {META_GRAPH_PERMISSIONS.map((permission, index) => (
                        <span key={permission}>
                          <code className="font-mono text-foreground">
                            {permission}
                          </code>
                          {index < META_GRAPH_PERMISSIONS.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      .
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={3} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Buka{' '}
                      <code className="font-mono text-foreground">
                        developers.facebook.com/tools/debug/accesstoken
                      </code>
                      , tempel token, klik Debug, lalu klik tombol Extend Access
                      Token di bagian bawah halaman.
                    </p>
                  </li>
                  <li className="flex gap-2">
                    <StepNumber value={4} />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Tempel token hasil extend ke kolom token di atas, klik
                      Deteksi akun, pilih Page, lalu klik Gunakan akun ini.
                    </p>
                  </li>
                </ol>

                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <GuideLink href={META_LINKS.apps} label="Meta Apps" />
                  <GuideLink
                    href={META_LINKS.explorer}
                    label="Graph API Explorer"
                  />
                  <GuideLink
                    href={META_LINKS.debugger}
                    label="Access Token Debugger"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="system-user">
              <AccordionTrigger>
                Kenapa tombol Generate token tidak muncul
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                  <p>
                    Di Meta Business Portfolio, tombol{' '}
                    <strong className="text-foreground">Generate token</strong>{' '}
                    baru muncul setelah Meta App ditautkan ke portfolio dan
                    di-assign ke System User yang dipakai.
                  </p>
                  <ol className="space-y-2">
                    <li className="flex gap-2">
                      <StepNumber value={1} />
                      <p>
                        Di Business Portfolio, buka{' '}
                        <code className="font-mono text-foreground">
                          Accounts &gt; Apps
                        </code>
                        , lalu pastikan Meta App terhubung dengan akses Full
                        Control.
                      </p>
                    </li>
                    <li className="flex gap-2">
                      <StepNumber value={2} />
                      <p>
                        Buka{' '}
                        <code className="font-mono text-foreground">
                          Users &gt; System Users
                        </code>
                        , klik nama System User, lalu klik Assign assets.
                      </p>
                    </li>
                    <li className="flex gap-2">
                      <StepNumber value={3} />
                      <p>
                        Pada Assign assets, tautkan Pages dengan Full Control dan
                        Apps dengan akses Manage App.
                      </p>
                    </li>
                    <li className="flex gap-2">
                      <StepNumber value={4} />
                      <p>
                        Setelah App ter-assign, tombol Generate token muncul di
                        bagian atas detail System User. Pilih App, atur masa
                        berlaku Never, lalu salin tokennya.
                      </p>
                    </li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={!isConfigured || isDisconnecting}
          onClick={() => void ctx.data.disconnectMeta()}
        >
          {isDisconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          Putuskan dan hapus token
        </Button>
      </div>
    </div>
  );
}
