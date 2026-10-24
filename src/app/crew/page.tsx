'use client';

import dynamic from 'next/dynamic';

const QuestGame = dynamic(() => import('@/components/quest/QuestGame'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex items-center justify-center bg-[#0b1220] text-amber-300 font-mono text-sm">
      Loading Schema City…
    </div>
  ),
});

export default function CrewPage() {
  return (
    <main className="w-screen h-screen overflow-hidden">
      <QuestGame />
    </main>
  );
}
