'use client';

import { useEffect, useState } from 'react';

/** True only after the first client render — used to gate persisted-store reads. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
