import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface SessionStats {
  session_id: string;
  totalmessages: number;
  usermessages: number;
  avatarmessages: number;
  averageresponsetime: number;
  sessionduration: string;
}

export default function SessionStats({ sessionId }: { sessionId: string }) {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!sessionId) return;

      try {
        console.log('Fetching stats for session:', sessionId);
        const { data, error } = await supabase
          .from('session_stats')
          .select('*')
          .eq('session_id', sessionId)
          .single();

        if (error) {
          console.error('Error fetching stats:', error);
          return;
        }

        console.log('Received stats:', data);
        setStats(data);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [sessionId]);

  if (loading) return <div>Loading...</div>;
  if (!stats) return <div>Geen statistieken beschikbaar</div>;

  // Formateer de responstijd naar seconden
  const responseTimeInSeconds = (stats.averageresponsetime * 60).toFixed(1);
  
  // Formateer de sessieduur naar minuten
  const [hours, minutes, seconds] = stats.sessionduration.split(':');
  const durationInMinutes = (
    parseInt(hours) * 60 + 
    parseInt(minutes) + 
    parseInt(seconds.split('.')[0]) / 60
  ).toFixed(1);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-lg font-bold mb-4 border-b pb-2">Sessie Statistieken</h2>
      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm text-gray-500 mb-1">Totaal Berichten</h3>
          <p className="text-2xl font-medium">{stats.totalmessages}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm text-gray-500 mb-1">Gebruiker Berichten</h3>
          <p className="text-2xl font-medium">{stats.usermessages}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm text-gray-500 mb-1">Adviseur Berichten</h3>
          <p className="text-2xl font-medium">{stats.avatarmessages}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm text-gray-500 mb-1">Gemiddelde Responstijd</h3>
          <p className="text-2xl font-medium">{responseTimeInSeconds}s</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm text-gray-500 mb-1">Sessie Duur</h3>
          <p className="text-2xl font-medium">{durationInMinutes}m</p>
        </div>
      </div>
    </div>
  );
}

async function calculateAndStoreStats(sessionId: string) {
  try {
    // Haal eerst alle berichten op voor deze sessie
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId);

    if (messagesError) throw messagesError;

    // Haal sessie informatie op
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (sessionError) throw sessionError;

    // Bereken de statistieken
    const totalMessages = messages?.length || 0;
    const userMessages = messages?.filter(m => m.sender === 'user').length || 0;
    const avatarMessages = messages?.filter(m => m.sender === 'avatar').length || 0;
    const averageResponseTime = session?.duration 
      ? parseFloat((Date.parse(session.duration) / (1000 * 60)).toFixed(2))
      : 0;
    const sessionDuration = session?.duration || '00:00:00';

    // Sla de statistieken op
    const { error: insertError } = await supabase
      .from('session_stats')
      .insert({
        session_id: sessionId,
        totalmessages: totalMessages,
        usermessages: userMessages,
        avatarmessages: avatarMessages,
        averageresponsetime: averageResponseTime,
        sessionduration: sessionDuration
      });

    if (insertError) throw insertError;

    console.log('Stats stored successfully for session:', sessionId);
    
  } catch (error) {
    console.error('Error calculating/storing stats:', error);
  }
}

async function onSessionEnd(sessionId) {
  // Andere logica voor het beëindigen van de sessie

  // Bereken en sla statistieken op
  await calculateAndStoreStats(sessionId);
}

async function updateAllSessions() {
  try {
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('session_id')
      .eq('status', 'completed');

    if (error) throw error;

    console.log(`Found ${sessions?.length} completed sessions to update`);

    for (const session of sessions || []) {
      await calculateAndStoreStats(session.session_id);
    }

    console.log('All session stats updated successfully');
    
  } catch (error) {
    console.error('Error updating all sessions:', error);
  }
}

// Roep de functie aan om alle sessies bij te werken
updateAllSessions();
