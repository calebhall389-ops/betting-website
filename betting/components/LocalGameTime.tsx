'use client';

import { useEffect, useState } from 'react';

type Props = {
  dateString: string;
};

export default function LocalEventTime({ dateString }: Props) {
  const [formatted, setFormatted] = useState('—');

  useEffect(() => {
    const date = new Date(dateString);

    const text = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);

    setFormatted(text);
  }, [dateString]);

  return <span>{formatted}</span>;
}
