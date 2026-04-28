'use client';

import { useEffect, useState } from 'react';

type Props = {
  value: string | null | undefined;
};

function normalizeUtcDate(value: string) {
  const trimmed = value.trim();

  // If timestamp already has timezone info, use it as-is
  if (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Supabase/API often stores UTC without Z — force it to UTC
  return `${trimmed}Z`;
}

export default function LocalGameTime({ value }: Props) {
  const [time, setTime] = useState<string>('—');

  useEffect(() => {
    if (!value) {
      setTime('—');
      return;
    }

    const date = new Date(normalizeUtcDate(value));

    if (Number.isNaN(date.getTime())) {
      setTime('—');
      return;
    }

    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);

    setTime(formatted);
  }, [value]);

  return <span>{time}</span>;
}
