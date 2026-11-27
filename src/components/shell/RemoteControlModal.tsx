import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Smartphone,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  isNotifSoundEnabled,
  playCpgpNotifSound,
  setNotifSoundEnabled,
} from '@/lib/notifSound';

export interface RemoteLanAddressInfo {
  ip: string;
  interfaceName: string;
  remoteUrl: string;
  pairUrl: string;
  qrSvg: string;
}

export interface ConnectedRemoteDevice {
  id: string;
  ip: string;
  deviceName: string;
  lastSeenAt: string;
}

export interface RemoteControlStatusPayload {
  enabled: boolean;
  pin: string;
  pairToken: string;
  soundOnDesktop: boolean;
  port: number;
  lanAddresses: RemoteLanAddressInfo[];
  primaryPairUrl: string;
  primaryRemoteUrl: string;
  primaryQrSvg: string;
  connectedDevices: ConnectedRemoteDevice[];
  updatedAt: string;
}

export interface RemoteControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged?: (enabled: boolean) => void;
}

export function RemoteControlModal({
  isOpen,
  onClose,
  onStatusChanged,
}: RemoteControlModalProps) {
  const [status, setStatus] = useState<RemoteControlStatusPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedIpIdx, setSelectedIpIdx] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<'link' | 'pin' | null>(null);
  const [desktopSound, setDesktopSound] = useState<boolean>(() =>
    isNotifSoundEnabled()
  );

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/remote/config');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          'Backend server belum memuat fitur Remote Control terbaru. Tutup lalu jalankan ulang server CPGP (npm run dev / start-planner) terlebih dahulu.'
        );
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || `Gagal memuat konfigurasi Remote Control (${res.status})`
        );
      }
      const data = (await res.json()) as RemoteControlStatusPayload;
      setStatus(data);
      onStatusChanged?.(data.enabled);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memuat konfigurasi Remote Control.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [onStatusChanged]);

  useEffect(() => {
    if (!isOpen) return;
    void loadConfig();
  }, [isOpen, loadConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const updateConfig = async (patch: {
    enabled?: boolean;
    soundOnDesktop?: boolean;
    regeneratePin?: boolean;
  }) => {
    setIsMutating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/remote/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          'Backend server belum memuat fitur Remote Control terbaru. Tutup lalu jalankan ulang server CPGP terlebih dahulu.'
        );
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error || `Gagal menyimpan pengaturan Remote (${res.status})`
        );
      }
      const data = (await res.json()) as RemoteControlStatusPayload;
      setStatus(data);
      onStatusChanged?.(data.enabled);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui pengaturan Remote.'
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopy = async (text: string, key: 'link' | 'pin') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  if (!isOpen) return null;

  const activeLan =
    status?.lanAddresses[selectedIpIdx] ?? status?.lanAddresses[0] ?? null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-control-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
        <div
          className="h-1 w-full bg-[image:var(--gradient-burgundy)]"
          aria-hidden="true"
        />

        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
              <Smartphone className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="remote-control-modal-title"
                className="text-sm font-semibold text-foreground"
              >
                Remote Control HP (Wi-Fi Lokal)
              </h2>
              <p className="text-xs text-muted-foreground">
                Kendalikan Auto-Post, Render Watermark, dan pantau progres dari
                smartphone.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Tutup dialog Remote Control"
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          {errorMsg ? (
            <div
              role="alert"
              className="rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b] dark:border-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]"
            >
              {errorMsg}
            </div>
          ) : null}

          {isLoading && !status ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Memuat konfigurasi jaringan lokal...</span>
            </div>
          ) : status ? (
            <>
              {/* Master toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3.5">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="remote-control-enable-switch"
                      className="cursor-pointer text-xs font-semibold text-foreground"
                    >
                      Akses Remote Wi-Fi Lokal
                    </label>
                    <Badge
                      variant={status.enabled ? 'success' : 'muted'}
                      size="xs"
                    >
                      {status.enabled ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {status.enabled
                      ? 'HP di jaringan Wi-Fi yang sama dapat terhubung dengan QR Code atau PIN 6 digit.'
                      : 'Server terkunci hanya untuk PC ini. Aktifkan saat ingin mengontrol dari HP.'}
                  </p>
                </div>

                <Switch
                  id="remote-control-enable-switch"
                  checked={status.enabled}
                  disabled={isMutating}
                  onCheckedChange={(checked) => {
                    void updateConfig({ enabled: checked });
                  }}
                />
              </div>

              {/* QR Code + 6-digit PIN card */}
              <div className="grid grid-cols-1 gap-3.5 rounded-lg border border-border bg-card p-3.5 sm:grid-cols-[168px_1fr]">
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border bg-white p-2.5">
                  {activeLan ? (
                    <div
                      className="h-36 w-36"
                      dangerouslySetInnerHTML={{ __html: activeLan.qrSvg }}
                    />
                  ) : null}
                  <span className="text-center text-[11px] font-medium text-[#1A1415]">
                    Scan dengan Kamera HP
                  </span>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-3">
                  <div className="space-y-2.5">
                    {status.lanAddresses.length > 1 ? (
                      <div className="space-y-1">
                        <label
                          htmlFor="remote-lan-adapter"
                          className="block text-xs font-medium text-foreground"
                        >
                          Adaptor Jaringan (IP PC)
                        </label>
                        <NativeSelect
                          id="remote-lan-adapter"
                          value={String(selectedIpIdx)}
                          onChange={(e) =>
                            setSelectedIpIdx(Number(e.target.value))
                          }
                          className="w-full font-mono text-xs"
                        >
                          {status.lanAddresses.map((addr, idx) => (
                            <option key={addr.ip} value={String(idx)}>
                              {addr.ip} ({addr.interfaceName})
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                          Alamat Remote Wi-Fi
                        </span>
                        <code className="block truncate rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
                          {activeLan?.remoteUrl ?? status.primaryRemoteUrl}
                        </code>
                      </div>
                    )}

                    <div className="space-y-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        PIN Akses Manual (6 Digit)
                      </span>
                      <div className="flex items-center justify-between gap-2 rounded border border-border bg-muted px-3 py-1.5">
                        <span className="font-mono text-lg font-bold tracking-widest text-foreground">
                          {status.pin}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => void handleCopy(status.pin, 'pin')}
                          >
                            {copiedKey === 'pin' ? (
                              <Check className="size-3" aria-hidden="true" />
                            ) : (
                              <Copy className="size-3" aria-hidden="true" />
                            )}
                            <span>
                              {copiedKey === 'pin' ? 'Disalin' : 'PIN'}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={isMutating}
                            title="Acak ulang PIN & QR Code (memutus perangkat lama)"
                            onClick={() =>
                              void updateConfig({ regeneratePin: true })
                            }
                          >
                            <RefreshCw className="size-3" aria-hidden="true" />
                            <span>Reset</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void handleCopy(
                          activeLan?.pairUrl ?? status.primaryPairUrl,
                          'link'
                        )
                      }
                    >
                      {copiedKey === 'link' ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : (
                        <Copy className="size-3" aria-hidden="true" />
                      )}
                      <span>
                        {copiedKey === 'link'
                          ? 'Link Pairing Disalin'
                          : 'Salin Link Pairing'}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        window.open('/remote', '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span>Pratinjau /remote</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Notification sound settings */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5">
                <div className="space-y-0.5">
                  <label
                    htmlFor="remote-desktop-sound-switch"
                    className="cursor-pointer text-xs font-medium text-foreground"
                  >
                    Suara Notifikasi Selesai (cpgp-notif.mp3)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Bunyikan notifikasi saat job Auto-Post atau Render Watermark
                    selesai.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      void playCpgpNotifSound({ force: true, vibrate: false })
                    }
                  >
                    <Volume2 className="size-3" aria-hidden="true" />
                    <span>Tes Suara</span>
                  </Button>
                  <Switch
                    id="remote-desktop-sound-switch"
                    checked={desktopSound}
                    onCheckedChange={(checked) => {
                      setDesktopSound(checked);
                      setNotifSoundEnabled(checked);
                      void updateConfig({ soundOnDesktop: checked });
                    }}
                  />
                </div>
              </div>

              {/* Connected devices */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    Perangkat HP Terhubung ({status.connectedDevices.length})
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => void loadConfig()}
                  >
                    <RefreshCw className="size-3" aria-hidden="true" />
                    <span>Segarkan</span>
                  </Button>
                </div>

                {status.connectedDevices.length === 0 ? (
                  <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Belum ada perangkat HP yang masuk pada sesi ini.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border bg-card text-xs">
                    {status.connectedDevices.map((dev) => (
                      <li
                        key={dev.id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="font-medium text-foreground">
                          {dev.deviceName}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {new Date(dev.lastSeenAt).toLocaleTimeString(
                            'id-ID',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
