import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
              <TrendingUp size={15} className="text-white" />
            </div>
            <span className="text-sm font-bold text-white">
              Sharp<span className="text-emerald-400">Edge</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/picks" className="hover:text-slate-300 transition-colors">Picks</Link>
            <Link href="/props" className="hover:text-slate-300 transition-colors">Props</Link>
            <Link href="/odds" className="hover:text-slate-300 transition-colors">Odds</Link>
            <Link href="/tracker" className="hover:text-slate-300 transition-colors">Tracker</Link>
          </div>
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} SharpEdge. For entertainment purposes only.
          </p>
        </div>
      </div>
    </footer>
  );
}
