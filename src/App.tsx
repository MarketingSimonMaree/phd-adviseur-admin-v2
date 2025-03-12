import React, { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { DashboardStats } from './components/DashboardStats';
import { SessionsList } from './components/SessionsList';
import { SessionDetails } from './components/SessionDetails';
import { supabase } from './lib/supabase';
import { LayoutDashboard, MessageSquare } from 'lucide-react';
import SessionStats from './components/SessionStats';
import { UsersPage } from './pages/UsersPage';

type View = 'dashboard' | 'sessions';

function App() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('sessions');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchSessions = async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('session_id, status, last_activity')
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error fetching sessions:', error);
      } else {
        setSessions(data);
      }
    };

    fetchSessions();
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      if (!selectedSessionId) return;

      const { data, error } = await supabase
        .from('session_stats')
        .select('*')
        .eq('session_id', selectedSessionId);

      if (error) {
        console.error('Error fetching stats:', error);
      } else {
        setStats(data[0]);
      }
    };

    fetchStats();
  }, [selectedSessionId]);

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Vul beide velden in');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggen mislukt');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Avatar Chat Monitoring</h1>
          {error && (
            <div className="mb-4 p-4 text-sm text-red-700 bg-red-100 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-mailadres
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#ce861b] focus:border-[#ce861b]"
                placeholder="Voer je e-mailadres in"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Wachtwoord
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#ce861b] focus:border-[#ce861b]"
                placeholder="Voer je wachtwoord in"
              />
            </div>
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full bg-[#ce861b] text-white py-2 px-4 rounded-md hover:bg-[#b67616] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Inloggen...' : 'Inloggen'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex h-screen bg-gray-50">
        <nav className="w-16 bg-white border-r border-gray-200">
          <div className="flex flex-col items-center py-4 space-y-4">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`p-3 rounded-lg transition-colors ${
                currentView === 'dashboard'
                  ? 'bg-[#ce861b] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Dashboard"
            >
              <LayoutDashboard className="w-6 h-6" />
            </button>
            <button
              onClick={() => setCurrentView('sessions')}
              className={`p-3 rounded-lg transition-colors ${
                currentView === 'sessions'
                  ? 'bg-[#ce861b] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Sessies"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
          </div>
        </nav>

        {currentView === 'dashboard' ? (
          <main className="flex-1 overflow-y-auto p-6">
            <DashboardStats />
          </main>
        ) : (
          <div className="flex flex-1">
            <aside className="w-96 bg-white border-r border-gray-200 overflow-y-auto">
              <SessionsList
                selectedSessionId={selectedSessionId}
                onSessionSelect={setSelectedSessionId}
              />
            </aside>
            <main className="flex-1 overflow-y-auto bg-gray-50">
              {selectedSessionId ? (
                <div className="flex">
                  <div className="w-[65%] border-r border-gray-200">
                    <SessionDetails sessionId={selectedSessionId} />
                  </div>
                  <div className="w-[35%] p-6">
                    <SessionStats sessionId={selectedSessionId} />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Selecteer een sessie om de details te bekijken
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default App;