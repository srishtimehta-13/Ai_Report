import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Upload, Lightbulb, Settings, BarChart2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Upload Data', path: '/upload', icon: Upload },
  { name: 'Insights', path: '/insights', icon: Lightbulb },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar = () => {
  return (
    <aside className="w-64 border-r border-slate-800 bg-[#0F172A] hidden md:flex flex-col h-screen sticky top-0">
      <div className="p-6 flex items-center space-x-3">
        <div className="bg-accent p-2 rounded-lg shadow-lg shadow-accent/20">
          <BarChart2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight leading-none">ReportAI</h1>
          <p className="text-[10px] text-accent font-medium mt-1 uppercase tracking-wider">Business Prediction</p>
        </div>
      </div>
      
      <div className="px-4 py-6 flex-1">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-3">Menu</div>
        <div className="space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </div>
      </div>
      
      <div className="p-4 border-t border-slate-800/60">
        <div className="flex items-center space-x-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer text-sm text-slate-400">
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0">
            <span className="text-white font-medium">JD</span>
          </div>
          <div className="overflow-hidden">
            <p className="text-white font-medium truncate">John Doe</p>
            <p className="text-xs truncate">Pro Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
