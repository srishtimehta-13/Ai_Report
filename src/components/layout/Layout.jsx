import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { LayoutDashboard, Upload, Lightbulb, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Upload', path: '/upload', icon: Upload },
  { name: 'Insights', path: '/insights', icon: Lightbulb },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Layout = () => {
  return (
    <div className="min-h-screen bg-background flex text-slate-300 pb-16 md:pb-0">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden p-4 md:p-8 flex flex-col">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0F172A] border-t border-slate-800 flex justify-around items-center h-16 px-2 z-50">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center w-full h-full text-[10px] font-medium transition-colors",
                isActive
                  ? "text-accent"
                  : "text-slate-500 hover:text-slate-300"
              )
            }
          >
            <item.icon className="w-5 h-5 mb-1" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
