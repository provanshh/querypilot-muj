'use client';

import { useState } from 'react';
import { ArrowUp, Mic, Radio, Square, Workflow, X, Zap } from 'lucide-react';
import type { AgentId } from '@/lib/quest/types';
import { cn } from '@/lib/utils';
import { AgentFlow } from '../AgentFlow';
import { ActivityFeed } from '../ActivityFeed';
import { ResultPanel } from '../ResultPanel';
import { agentMeta } from '../agents';
import type { Theme } from '../theme';
import { Badge, Button, Card, CardHeader, Empty } from '../ui';
import type { DatasetSummary } from '../useData';
import type { Mission } from '../useMission';

interface VoiceUi { supported: boolean; listening: boolean; interim: string; listen: () => void }

function Composer({ dataset, theme, running, onAsk, onStop, voice }: {
  dataset: DatasetSummary;
  theme: Theme;
  running: boolean;
  onAsk: (q: string) => void;
  onStop: () => void;
  voice: VoiceUi;
}) {
  const [q, setQ] = useState('');
  const submit = () => { if (q.trim() && !running) onAsk(q.trim()); };
  return (
    <Card className="p-5">
      <div className={cn('flex items-center gap-2 rounded-full bg-[#f4f4f4] py-2 pl-5 pr-2 transition-all duration-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(185,170,246,0.45)]', voice.listening && 'bg-white shadow-[0_0_0_4px_rgba(214,242,106,0.8)]')}>
        <theme.icon className={cn('h-5 w-5 shrink-0', theme.textSoft)} />
        <input
          value={voice.listening ? voice.interim || q : q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={voice.listening ? 'Listening… ask your question' : dataset.questions[0] ? `Ask ${dataset.name} anything, e.g. "${dataset.questions[0].question}"` : `Ask ${dataset.name} anything`}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-[#1d1d1f] outline-none placeholder:text-black/35"
          aria-label="Question"
        />
        {voice.supported && (
          <button
            onClick={voice.listen}
            title={voice.listening ? 'Stop listening' : 'Ask by voice (shortcut: V)'}
            className={cn(
              'relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1.3)] active:scale-90',
              voice.listening ? 'bg-[#d6f26a] text-[#1d1d1f]' : 'bg-white text-[#1d1d1f] hover:scale-110 hover:bg-[#d6f26a]',
            )}
          >
            {voice.listening && <span className="qp-ring absolute inset-0 rounded-full bg-[#d6f26a]" />}
            <span className="relative">{voice.listening ? <span className="qp-wave flex h-4 items-center gap-[2px]"><span className="h-4" /><span className="h-4" /><span className="h-4" /><span className="h-4" /></span> : <Mic className="h-[18px] w-[18px]" />}</span>
          </button>
        )}
        {running ? (
          <Button variant="danger" className="!h-11" onClick={onStop}><Square className="h-3.5 w-3.5" /> Stop</Button>
        ) : (
          <Button variant="primary" className="!h-11 !px-5" accent="rgba(124,108,240,0.8)" onClick={submit} disabled={!q.trim()}><ArrowUp className="h-4 w-4 transition-transform duration-200 group-hover/btn:-translate-y-0.5" /> Ask agents</Button>
        )}
      </div>
      {dataset.questions.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] font-semibold text-black/40" title="Built from this dataset's own columns">Try:</span>
        {dataset.questions.map((s) => (
          <button
            key={s.id}
            disabled={running}
            onClick={() => { setQ(s.question); onAsk(s.question); }}
            className="group inline-flex items-center gap-1.5 rounded-full bg-[#f4f4f4] px-3.5 py-1.5 text-[12.5px] font-medium text-black/70 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#d6f26a] hover:text-[#1d1d1f] hover:shadow-[0_8px_18px_-10px_rgba(29,29,31,0.4)] active:scale-[0.97] disabled:opacity-50"
          >
            <Zap className="h-3 w-3 text-[#7c6cf0] transition-colors group-hover:text-[#1d1d1f]" />
            {s.question}
          </button>
        ))}
      </div>}
      {voice.supported && (
        <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-black/40">
          <Mic className="h-3 w-3" /> Tap the mic or press <kbd className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-sans font-semibold text-black/60">V</kbd> to ask by voice. Answers to spoken questions are read back to you.
        </div>
      )}
    </Card>
  );
}

export function AskView({ dataset, theme, mission, onAsk, onStop, voice, onSpeak }: {
  dataset: DatasetSummary;
  theme: Theme;
  mission: Mission;
  onAsk: (q: string) => void;
  onStop: () => void;
  voice: VoiceUi;
  onSpeak: (text: string) => void;
}) {
  const [agent, setAgent] = useState<AgentId | null>(null);
  const isMine = mission.request?.dataset === dataset.id && mission.request.mode === 'ask';
  const events = isMine ? mission.events : [];
  const running = isMine && mission.status === 'running';
  const verdict = isMine ? mission.verdict : null;

  return (
    <div className="space-y-4">
      <Composer dataset={dataset} theme={theme} running={running} onAsk={onAsk} onStop={onStop} voice={voice} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            icon={<Workflow className="h-4 w-4" />}
            title="Agent workflow"
            subtitle={running ? 'Live: each edge lights up when one agent hands work to the next' : events.length ? 'Last run, as recorded. Click an agent to see what it did.' : 'Six agents, each with one job. Click any agent to learn its role.'}
            action={running ? <Badge tone="green" dot><Radio className="h-3 w-3" /> Live</Badge> : mission.status === 'error' && isMine ? <Badge tone="red">{mission.error}</Badge> : null}
          />
          <div className="px-3 pb-3"><AgentFlow events={events} running={running} selected={agent} onSelect={setAgent} /></div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader
            title="Live activity"
            subtitle={agent ? `Only ${agentMeta(agent).title}` : `${events.length} events`}
            action={agent ? <Button size="sm" variant="ghost" onClick={() => setAgent(null)}><X className="h-3.5 w-3.5" /> All agents</Button> : null}
          />
          <div className="flex-1 px-4 pb-4">
            {events.length ? <ActivityFeed events={events} running={running} filter={agent} maxHeight={300} /> : (
              agent ? (
                <div className="rounded-2xl bg-[#f4f4f4] p-3 text-[12.5px] text-black/60"><span className="font-semibold text-[#1d1d1f]">{agentMeta(agent).title}:</span> {agentMeta(agent).role}.</div>
              ) : <Empty icon={<Radio className="h-5 w-5" />} title="Waiting for a question" body="Every step the agents take streams here as it happens." />
            )}
          </div>
        </Card>
      </div>

      <ResultPanel key={mission.id ?? 'none'} verdict={verdict} running={running} accent={theme.hex} onSpeak={onSpeak} question={mission.request?.question} />
    </div>
  );
}
