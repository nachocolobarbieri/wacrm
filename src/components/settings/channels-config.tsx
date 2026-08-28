'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import { CHANNEL_ICONS, type ChannelId } from '@/components/icons/channel-icons';

type Channel = ChannelId;

const CHANNELS: { id: Channel; Icon: (typeof CHANNEL_ICONS)[Channel] }[] = [
  { id: 'whatsapp', Icon: CHANNEL_ICONS.whatsapp },
  { id: 'instagram', Icon: CHANNEL_ICONS.instagram },
  { id: 'facebook', Icon: CHANNEL_ICONS.facebook },
  { id: 'telegram', Icon: CHANNEL_ICONS.telegram },
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
  const [syncing, setSyncing] = useState(false);

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

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/zernio/accounts/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t('toastSyncFailed', { error: data.error ?? 'unknown' }));
        return;
      }
      toast.success(
        t('toastSynced', {
          accounts: data.imported ?? 0,
          messages: data.messages ?? 0,
        }),
      );
      await load();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          canEditSettings ? (
            <Button variant="outline" size="sm" disabled={syncing} onClick={handleSync}>
              {syncing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('syncing')}
                </>
              ) : (
                t('sync')
              )}
            </Button>
          ) : undefined
        }
      />

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
