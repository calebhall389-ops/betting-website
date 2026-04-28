'use client';

import { useEffect, useState } from 'react';

type Props = {
  value: string | null | undefined;
};

export default function LocalGameTime({ value }: Props) {
  const [time, setTime] = useState<string>('—');

  useEffect(() => {
    if (!value) {
      setTime('—');
      return;
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
      setTime('—');
      return;
    }

    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix', // ✅ FIX
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true, // optional but cleaner
    }).format(date);

    setTime(formatted);
  }, [value]);

  return <span>{time}</span>;
}
