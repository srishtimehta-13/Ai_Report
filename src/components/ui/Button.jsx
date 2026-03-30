import React from 'react';
import { cn } from '../../lib/utils';

export const Button = React.forwardRef(({ className, variant = 'primary', size = 'default', children, ...props }, ref) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:pointer-events-none ring-offset-background";
  
  const variants = {
    primary: "bg-accent text-white hover:bg-blue-600 shadow-sm",
    secondary: "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700",
    ghost: "hover:bg-slate-800 text-slate-300 hover:text-white",
    outline: "border border-slate-700 hover:bg-slate-800 text-white",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20"
  };

  const sizes = {
    default: "h-10 py-2 px-4",
    sm: "h-9 px-3 text-sm rounded-md",
    lg: "h-11 px-8 rounded-md text-lg",
    icon: "h-10 w-10",
  };

  return (
    <button
      ref={ref}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";
