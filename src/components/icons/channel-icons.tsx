import type { SVGProps } from 'react';

// Brand marks, inline — lucide-react dropped these for licensing reasons.

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.21-8.25 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.78.97-.15.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.14-.24-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.16 0-.43.06-.66.31-.23.24-.86.85-.86 2.06 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.87.24-1.46 1.5-1.46H16.5V4.35c-.27-.04-1.2-.12-2.28-.12-2.25 0-3.79 1.37-3.79 3.9V10.5H8v3h2.43V21h3.07Z" />
    </svg>
  );
}

export function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21.5 4.5 2.7 11.8c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.2-.5-1.8-1.6-1.7Zm-3.3 3.4L9.9 14.6l-.3 3.1-1.4-4.4 9.9-6.3c.5-.3.9-.1.6.3Z" />
    </svg>
  );
}

export type ChannelId = 'whatsapp' | 'instagram' | 'facebook' | 'telegram';

export const CHANNEL_ICONS: Record<
  ChannelId,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  telegram: TelegramIcon,
};

export const CHANNEL_COLORS: Record<ChannelId, string> = {
  whatsapp: 'text-green-600 bg-green-50 dark:bg-green-950',
  instagram: 'text-pink-600 bg-pink-50 dark:bg-pink-950',
  facebook: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
  telegram: 'text-sky-600 bg-sky-50 dark:bg-sky-950',
};

/** Small round channel badge — used on conversation rows and headers. */
export function ChannelBadge({
  channel,
  className,
}: {
  channel: string | null | undefined;
  className?: string;
}) {
  const id = (channel ?? 'whatsapp') as ChannelId;
  const Icon = CHANNEL_ICONS[id] ?? WhatsAppIcon;
  const colors = CHANNEL_COLORS[id] ?? CHANNEL_COLORS.whatsapp;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full p-1 ${colors} ${className ?? ''}`}
      title={id}
    >
      <Icon className="size-3" />
    </span>
  );
}
