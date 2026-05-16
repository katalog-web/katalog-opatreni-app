import { Suspense } from 'react';
import DetailPageClient from './DetailPageClient';

// Static export compatible wrap
export const dynamic = 'force-static';

export default function DetailPage() {
  return (
    <Suspense fallback={<div className="p-24 text-center animate-pulse">Načítám detail...</div>}>
      <DetailPageClient />
    </Suspense>
  );
}
