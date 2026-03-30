import React from 'react';
import { cn } from '../../lib/utils';

export const Badge = ({ className, variant = 'default', ...props }) => {
  const variants = {
    default: "bg-slate-800 text-slate-100 border-slate-700/50",
    primary: "bg-accent/10 text-accent border-accent/20",
    success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/25",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
};
