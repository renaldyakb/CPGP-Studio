import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, Lock, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface RemoteAuthGateProps {
  remoteDisabled: boolean;
  isExchangingToken: boolean;
  initialError?: string | null;
  onSubmitPin: (pin: string) => Promise<void>;
  onRetryStatus: () => void;
}

export function RemoteAuthGate({
  remoteDisabled,
  isExchangingToken,
  initialError = null,
  onSubmitPin,
  onRetryStatus,
}: RemoteAuthGateProps) {
  const [pin, setPin] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorMessage = localError || initialError;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleaned = pin.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setLocalError('Masukkan 6 digit angka PIN dari layar PC.');
      return;
    }
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onSubmitPin(cleaned);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'PIN tidak sesuai.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div
          className="h-1.5 w-full bg-[image:var(--gradient-burgundy)]"
          aria-hidden="true"
        />

        <div className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[image:var(--gradient-burgundy)] text-white shadow-sm">
              {remoteDisabled ? (
                <Lock className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              CPGP Remote Control
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {remoteDisabled
                ? 'Akses Remote Wi-Fi sedang dimatikan di aplikasi Desktop CPGP.'
                : 'Masukkan PIN 6 digit yang tampil di tombol Remote HP pada PC Anda, atau scan ulang QR Code.'}
            </p>
          </div>

          {isExchangingToken ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-2.5 py-6 text-xs text-muted-foreground"
            >
              <Loader2 className="h-5 w-5 animate-spin text-foreground" aria-hidden="true" />
              <span>Menyambungkan sesi dari QR Code...</span>
            </div>
          ) : remoteDisabled ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                Buka CPGP Studio di PC, klik tombol{' '}
                <strong className="font-semibold text-foreground">
                  Remote HP
                </strong>{' '}
                di pojok kanan atas, lalu aktifkan sakelar Wi-Fi Lokal.
              </div>
              <Button
                type="button"
                variant="editorial"
                className="min-h-12 w-full text-sm font-semibold"
                onClick={onRetryStatus}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Cek Ulang Koneksi</span>
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="remote-pin-input"
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>PIN 6 Digit</span>
                </label>
                <Input
                  id="remote-pin-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={pin}
                  disabled={isSubmitting}
                  onChange={(e) => {
                    setLocalError(null);
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="000000"
                  className="min-h-12 text-center font-mono text-xl font-bold tracking-[0.35em]"
                />
              </div>

              {errorMessage ? (
                <p
                  role="alert"
                  className="rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b] dark:border-[#991b1b] dark:bg-[#450a0a] dark:text-[#fca5a5]"
                >
                  {errorMessage}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="editorial"
                disabled={isSubmitting || pin.length !== 6}
                className="min-h-12 w-full text-sm font-semibold"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                <span>Masuk Remote Studio</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
