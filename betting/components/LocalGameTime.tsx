'use client';

import { useEffect, useState } from 'react';

type Props = {
  value?: string | null;
};

export default function LocalGameTime({ value }: Props) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setFormatted(null);
      return;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      setFormatted(null);
      return;
    }

    const text = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);

    setFormatted(text);
  }, [value]);

  if (!formatted) return null;

  return <span>Starts: {formatted}</span>;
}
