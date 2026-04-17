'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  TrendingUp,
  BarChart2,
  Target,
  ListChecks,
  Settings,
  Activity,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navLinks = [
  { href: '/picks', label: 'Picks', icon: Target },
  { href: '/live', label: 'Live', icon: Activity },
  { href: '/props', label: 'Props', icon: TrendingUp },
  { href: '/odds', label: 'Odds', icon: BarChart2 },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/admin', label: 'Admin', icon: Settings },
];

function linkClasses(active: boolean) {
  return `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
    active
      ? 'bg-white/15 text-white'
      : 'text-white/75 hover:bg-white/10 hover:text-white'
  }`;
}

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold tracking-wide text-white">
          SharpEdge
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={linkClasses(active)}>
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-xl border border-white/10 p-2 text-white md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 px-4 pb-4 md:hidden">
          <nav className="mt-3 flex flex-col gap-2">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={linkClasses(active)}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
