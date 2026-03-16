import React from 'react';

type Props = { label: string; ok: boolean; value?: string };

export const StatusPill: React.FC<Props> = ({ label, ok, value }) => {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        ok ? 'border-green-400/30 bg-green-500/10 text-green-100' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
      }`}
    >
      <span className="text-[11px] uppercase tracking-[0.18em]">{label}</span>
      <span className="text-xs truncate">{value || (ok ? 'ready' : 'waiting')}</span>
    </div>
  );
};
