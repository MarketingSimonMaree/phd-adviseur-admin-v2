import React from 'react';
import { Monitor, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserMenu } from './UserMenu';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold">Avatar Chat Monitoring</h1>
          <UserMenu />
        </div>
      </header>
      {children}
    </div>
  );
}