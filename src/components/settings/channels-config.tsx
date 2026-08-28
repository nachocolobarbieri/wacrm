'use client';

import { useCallback, useEffect, useState, type JSX, type SVGProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

type Channel = 'whatsapp' | 'instagram' | 'facebook';

// Brand marks, inline — lucide-react dropped these for licensing reasons.
function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.21-8.25 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.78.97-.15.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.16 0-.43.06-.66.31-.23.24-.86.85-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.87.24-1.46 1.5-1.46H16.5V4.35c-.27-.04-1.2-.12-2.28-.12-2.25 0-3.79 1.37-3.79 3.9V10.5H8v3h2.43V21h3.07Z" />
    </svg>
  );
}

const CHANNELS: { id: Channel; Icon: (props: SVGProps<SVGSVGElement>) => JSX.Element }[] = [
  { id: 'whatsapp', Icon: WhatsAppIcon },
  { id: 'instagram', Icon: InstagramIcon },
  { id: 'facebook', Icon: FacebookIcon },
];

interface ChannelAccount {
  id: string;
  channel: Channel;
  external_id: string;
  username: string | null;
  display_name: string | null;
  is_active: boolean;
}

export function ChannelsConfig() {
  const t = useTranslations('Settings.channels');
  const { canEditSettings } = useAuth();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ChannelAccount[]>([]);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/zernio/accounts');
      const data = await res.json();
      setAccounts(res.ok ? (data.accounts ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Feedback from the redirect back out of /api/zernio/callback.
  useEffect(() => {
    const connected = searchParams.get('zernio_connected');
    const error = searchParams.get('zernio_error');
    if (connected) {
      toast.success(t('toastConnected', { name: t(`${connected as Channel}.name`) }));
    } else if (error) {
      const key = `errors.${error}` as const;
      toast.error(t.has(key) ? t(key) : t('errors.connect_failed'));
    }
  }, [searchParams, t]);

  async function handleDisconnect(account: ChannelAccount) {
    setDisconnectingId(account.id);
    try {
      const res = await fetch(`/api/zernio/accounts/${account.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t('toastDisconnectFailed', { error: data.error ?? 'unknown' }));
        return;
      }
      toast.success(t('toastDisconnected', { name: t(`${account.channel}.name`) }));
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    } finally {
      setDisconnectingId(null);
    }
  }

  return (
    <div>
      <SettingsPanelHead title={t('title')} description={t('description')} />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map(({ id, Icon }) => {
            const account = accounts.find((a) => a.channel === id && a.is_active);
            return (
              <Card key={id}>
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-5 text-muted-foreground" />
                    <CardTitle className="text-base">{t(`${id}.name`)}</CardTitle>
                  </div>
                  <CardDescription>{t(`${id}.description`)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {account ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="size-2 rounded-full bg-green-500" />
                        <span className="text-foreground">
                          {account.username
                            ? t('connectedAs', { username: account.username })
                            : t('connected')}
                        </span>
                      </div>
                      {canEditSettings ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={disconnectingId === account.id}
                          onClick={() => handleDisconnect(account)}
                        >
                          {disconnectingId === account.id ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              {t('disconnecting')}
                            </>
                          ) : (
                            t('disconnect')
                          )}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="size-2 rounded-full bg-muted-foreground/40" />
                        {t('notConnected')}
                      </div>
                      {canEditSettings ? (
                        <Button
                          size="sm"
                          render={<a href={`/api/zernio/connect?channel=${id}`} />}
                        >
                          {t('connect')}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
