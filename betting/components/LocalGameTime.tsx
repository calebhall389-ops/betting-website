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

    // Handle invalid date
    if (isNaN(date.getTime())) {
      setTime('—');
      return;
    }

    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);

    setTime(formatted);
  }, [value]);

  return <span>{time}</span>;
}
