import React, { useEffect, useState } from 'react';
import { format, formatDistance, subDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { stopHeyGenSession, getHeyGenSessionStatus, getAllActiveSessions, syncHeyGenMessages } from '../lib/heygen';
import { StopCircle, Star, Archive, Calendar, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { motion, AnimatePresence } from 'framer-motion';
import "react-datepicker/dist/react-datepicker.css";

interface Session {
  id: string;
  session_id: string;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'connecting' | 'connected' | 'completed' | 'error';
  heygen_status: string | null;
  last_sync_at: string | null;
  duration: string | null;
  is_relevant: boolean;
  is_archived: boolean;
  deleted_at: string | null;
}

interface SessionsListProps {
  selectedSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
}

const DATE_PRESETS = [
  { label: 'Afgelopen 7 dagen', days: 7 },
  { label: 'Afgelopen 14 dagen', days: 14 },
  { label: 'Afgelopen 30 dagen', days: 30 },
];

const STATUS_TRANSLATIONS = {
  active: 'Actief',
  connecting: 'Verbinden',
  connected: 'Verbonden',
  completed: 'Voltooid',
  error: 'Fout',
};

const VIEW_MODES = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  TRASH: 'trash'
} as const;

type ViewMode = typeof VIEW_MODES[keyof typeof VIEW_MODES];

export function SessionsList({ selectedSessionId, onSessionSelect }: SessionsListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stoppingSession, setStoppingSession] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(VIEW_MODES.ACTIVE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingSession, setUpdatingSession] = useState<string | null>(null);
  const [animatingSessionId, setAnimatingSessionId] = useState<string | null>(null);
  const [animationType, setAnimationType] = useState<'archive' | 'delete' | null>(null);

  const handleDatePresetChange = (days: number) => {
    setStartDate(subDays(new Date(), days));
    setEndDate(new Date());
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    try {
      setIsRefreshing(true);
      setError(null);

      // Get all active sessions from Supabase
      const { data: activeSessions, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .in('status', ['active', 'connecting', 'connected'])
        .is('end_time', null);

      if (fetchError) throw fetchError;

      if (!activeSessions || activeSessions.length === 0) {
        setIsRefreshing(false);
        return;
      }

      // Get all active sessions from HeyGen
      const heygenSessions = await getAllActiveSessions();
      const activeHeygenSessionIds = new Set(heygenSessions.map(s => s.session_id));

      // Process each session
      await Promise.all(
        activeSessions.map(async (session) => {
          const isActiveInHeyGen = activeHeygenSessionIds.has(session.session_id);
          
          if (!isActiveInHeyGen) {
            // If session is not active in HeyGen, mark it as completed
            await supabase
              .from('sessions')
              .update({
                status: 'completed',
                heygen_status: 'completed',
                end_time: new Date().toISOString(),
                last_sync_at: new Date().toISOString()
              })
              .eq('session_id', session.session_id);
          } else {
            // If session is active, sync its messages
            await syncHeyGenMessages(session.session_id);
          }
        })
      );

      fetchSessions();
    } catch (err) {
      console.error('Error refreshing sessions:', err);
      setError(err instanceof Error ? err.message : 'Sessies vernieuwen mislukt');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchSessions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase
        .from('sessions')
        .select('*')
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      switch (viewMode) {
        case VIEW_MODES.ACTIVE:
          query = query.eq('is_archived', false).is('deleted_at', null);
          break;
        case VIEW_MODES.ARCHIVED:
          query = query.eq('is_archived', true).is('deleted_at', null);
          break;
        case VIEW_MODES.TRASH:
          query = query.not('deleted_at', 'is', null);
          break;
      }

      const { data: supabaseSessions, error: supabaseError } = await query;

      if (supabaseError) {
        throw supabaseError;
      }

      if (supabaseSessions) {
        setSessions(supabaseSessions);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError(err instanceof Error ? err.message : 'Sessies ophalen mislukt');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    const subscription = supabase
      .channel('sessions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, fetchSessions)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [filter, startDate, endDate, viewMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh();
    }, 10000); // Elke 10 seconden

    return () => clearInterval(interval);
  }, []);

  const handleStopSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (stoppingSession) return;

    try {
      setStoppingSession(sessionId);
      setError(null);

      await stopHeyGenSession(sessionId);

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ 
          status: 'completed',
          heygen_status: 'completed',
          end_time: new Date().toISOString(),
          last_sync_at: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      if (updateError) throw updateError;

      fetchSessions();
    } catch (err) {
      console.error('Error stopping session:', err);
      setError(err instanceof Error ? err.message : 'Sessie stoppen mislukt');
    } finally {
      setStoppingSession(null);
    }
  };

  const handleToggleRelevant = async (sessionId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    try {
      setUpdatingSession(sessionId);
      const { error } = await supabase
        .from('sessions')
        .update({ is_relevant: !currentValue })
        .eq('session_id', sessionId);

      if (error) throw error;

      fetchSessions();
    } catch (err) {
      console.error('Error toggling relevant status:', err);
      setError(err instanceof Error ? err.message : 'Sessie bijwerken mislukt');
    } finally {
      setUpdatingSession(null);
    }
  };

  const handleMoveToTrash = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    try {
      setUpdatingSession(sessionId);
      const { error } = await supabase
        .from('sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('session_id', sessionId);

      if (error) throw error;

      fetchSessions();
    } catch (err) {
      console.error('Error moving session to trash:', err);
      setError(err instanceof Error ? err.message : 'Sessie naar prullenbak verplaatsen mislukt');
    } finally {
      setUpdatingSession(null);
    }
  };

  const handleRestoreFromTrash = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    try {
      setUpdatingSession(sessionId);
      const { error } = await supabase
        .from('sessions')
        .update({ deleted_at: null })
        .eq('session_id', sessionId);

      if (error) throw error;

      fetchSessions();
    } catch (err) {
      console.error('Error restoring session from trash:', err);
      setError(err instanceof Error ? err.message : 'Sessie herstellen mislukt');
    } finally {
      setUpdatingSession(null);
    }
  };

  const handleToggleArchived = async (sessionId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    try {
      setUpdatingSession(sessionId);
      console.log('Archiving session:', sessionId, 'current value:', currentValue);
      
      const { error } = await supabase
        .from('sessions')
        .update({ is_archived: !currentValue })
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error updating archive status:', error);
        throw error;
      }

      console.log('Archive status updated successfully');
      fetchSessions();
    } catch (err) {
      console.error('Error toggling archive status:', err);
      setError(err instanceof Error ? err.message : 'Sessie archiveren mislukt');
    } finally {
      setUpdatingSession(null);
    }
  };

  const handleArchiveAnimation = async (sessionId: string, currentValue: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    setAnimatingSessionId(sessionId);
    setAnimationType('archive');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await handleToggleArchived(sessionId, currentValue, e);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setAnimatingSessionId(null);
    setAnimationType(null);
  };

  const handleDeleteAnimation = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (updatingSession === sessionId) return;

    setAnimatingSessionId(sessionId);
    setAnimationType('delete');
    
    await new Promise(resolve => setTimeout(resolve, 50));
    await handleMoveToTrash(sessionId, e);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setAnimatingSessionId(null);
    setAnimationType(null);
  };

  const getDuration = (startTime: string, endTime: string | null) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    return formatDistance(start, end, { addSuffix: false, locale: nl });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
        return 'bg-green-500';
      case 'completed':
        return 'bg-blue-500';
      case 'connecting':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  const getStatusDisplay = (session: Session) => {
    const statusTranslation = STATUS_TRANSLATIONS[session.status as keyof typeof STATUS_TRANSLATIONS];
    if (session.status === session.heygen_status || !session.heygen_status) {
      return statusTranslation;
    }
    return `${statusTranslation} (HeyGen: ${session.heygen_status})`;
  };

  const getDeleteDate = (deletedAt: string) => {
    const deleteDate = new Date(deletedAt);
    const permanentDeleteDate = new Date(deleteDate);
    permanentDeleteDate.setDate(permanentDeleteDate.getDate() + 30);
    return format(permanentDeleteDate, 'dd/MM/yyyy');
  };

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <p className="text-red-700">{error}</p>
        </div>
        <button 
          onClick={() => setError(null)}
          className="text-gray-600 hover:text-gray-800 text-sm"
        >
          Sluiten
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Sessies</h2>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ce861b] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Vernieuwen...' : 'Vernieuwen'}
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-[#ce861b] focus:ring-[#ce861b] sm:text-sm"
            >
              <option value="all">Alle Sessies</option>
              <option value="active">Actief</option>
              <option value="connecting">Verbinden</option>
              <option value="connected">Verbonden</option>
              <option value="completed">Voltooid</option>
              <option value="error">Fout</option>
            </select>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode(VIEW_MODES.ACTIVE)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                viewMode === VIEW_MODES.ACTIVE
                  ? 'bg-[#ce861b] text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Actief
            </button>
            <button
              onClick={() => setViewMode(VIEW_MODES.ARCHIVED)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                viewMode === VIEW_MODES.ARCHIVED
                  ? 'bg-[#ce861b] text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Gearchiveerd
            </button>
            <button
              onClick={() => setViewMode(VIEW_MODES.TRASH)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                viewMode === VIEW_MODES.TRASH
                  ? 'bg-[#ce861b] text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Prullenbak
            </button>
          </div>
        </div>

        {viewMode !== VIEW_MODES.TRASH && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() => handleDatePresetChange(preset.days)}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#ce861b] focus:ring-offset-2"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Startdatum</label>
                <DatePicker
                  selected={startDate}
                  onChange={(date) => setStartDate(date || new Date())}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#ce861b] focus:ring-[#ce861b]"
                  maxDate={endDate}
                  locale={nl}
                  dateFormat="dd/MM/yyyy"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Einddatum</label>
                <DatePicker
                  selected={endDate}
                  onChange={(date) => setEndDate(date || new Date())}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-[#ce861b] focus:ring-[#ce861b]"
                  minDate={startDate}
                  maxDate={new Date()}
                  locale={nl}
                  dateFormat="dd/MM/yyyy"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-gray-600">Sessies laden...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-gray-600">
            {viewMode === VIEW_MODES.TRASH
              ? 'Geen sessies in de prullenbak'
              : viewMode === VIEW_MODES.ARCHIVED
              ? 'Geen gearchiveerde sessies'
              : 'Geen sessies gevonden'}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sessions.map((session) => (
              <motion.div
                key={session.session_id}
                initial={{ opacity: 1, x: 0, height: "auto" }}
                animate={{
                  x: animatingSessionId === session.session_id 
                    ? animationType === 'archive' 
                      ? -400
                      : animationType === 'delete'
                      ? 400
                      : 0
                    : 0,
                  backgroundColor: animatingSessionId === session.session_id
                    ? animationType === 'archive'
                      ? ['#fef3c7', '#fef3c7']
                      : animationType === 'delete'
                      ? ['#fee2e2', '#fee2e2']
                      : 'transparent'
                    : 'transparent',
                  transition: {
                    x: { duration: 0.5, ease: "easeInOut" },
                    backgroundColor: { duration: 0.3 }
                  }
                }}
                exit={{
                  opacity: 0,
                  x: animationType === 'archive' ? -400 : 400,
                  height: 0,
                  marginTop: 0,
                  marginBottom: 0,
                  padding: 0,
                  transition: { 
                    duration: 0.3,
                    ease: "easeInOut"
                  }
                }}
                onClick={() => onSessionSelect(session.session_id)}
                className={`p-4 border-b border-gray-200 hover:bg-gray-50 cursor-pointer ${
                  selectedSessionId === session.session_id ? 'bg-gray-50' : ''
                } ${session.is_archived ? 'opacity-75' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                    <span className="font-medium text-gray-900">
                      Sessie {session.session_id.slice(0, 8)}
                    </span>
                    {session.deleted_at && (
                      <span className="text-sm text-red-600">
                        Wordt permanent verwijderd op {getDeleteDate(session.deleted_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {!session.deleted_at && (
                      <>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => handleToggleRelevant(session.session_id, session.is_relevant, e)}
                          className={`p-1 hover:bg-gray-100 rounded transition-colors ${
                            updatingSession === session.session_id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          disabled={updatingSession === session.session_id}
                          title={session.is_relevant ? "Verwijder uit relevant" : "Markeer als relevant"}
                        >
                          <Star className={`h-5 w-5 ${session.is_relevant ? 'text-yellow-400' : 'text-gray-400'}`} />
                        </motion.button>
                        {viewMode === VIEW_MODES.ARCHIVED ? (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => handleDeleteAnimation(session.session_id, e)}
                            className={`p-1 hover:bg-gray-100 rounded transition-colors ${
                              updatingSession === session.session_id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            disabled={updatingSession === session.session_id}
                            title="Verplaats naar prullenbak"
                          >
                            <Trash2 className="h-5 w-5 text-red-600 hover:text-red-800" />
                          </motion.button>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => handleArchiveAnimation(session.session_id, session.is_archived, e)}
                            className={`p-1 hover:bg-gray-100 rounded transition-colors ${
                              updatingSession === session.session_id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            disabled={updatingSession === session.session_id}
                            title={session.is_archived ? "Dearchiveren" : "Archiveren"}
                          >
                            <Archive className={`h-5 w-5 ${session.is_archived ? 'text-blue-400' : 'text-gray-400'}`} />
                          </motion.button>
                        )}
                        {session.status === 'active' && session.heygen_status !== 'completed' && (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => handleStopSession(session.session_id, e)}
                            disabled={stoppingSession === session.session_id}
                            className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                            title="Sessie stoppen"
                          >
                            <StopCircle className="h-5 w-5 text-red-600 hover:text-red-800" />
                          </motion.button>
                        )}
                      </>
                    )}
                    {session.deleted_at && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => handleRestoreFromTrash(session.session_id, e)}
                        className={`p-1 hover:bg-gray-100 rounded transition-colors ${
                          updatingSession === session.session_id ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        disabled={updatingSession === session.session_id}
                        title="Herstel uit prullenbak"
                      >
                        <RotateCcw className="h-5 w-5 text-green-600 hover:text-green-800" />
                      </motion.button>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-gray-500 flex justify-between items-center">
                  <span className={`px-2 py-0.5 text-sm rounded-full ${
                    session.status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {session.status === 'active' ? 'Actief' : 'Voltooid'}
                  </span>
                  <span>{getStatusDisplay(session)}</span>
                  <div className="flex space-x-4">
                    <span>Duur: {getDuration(session.start_time, session.end_time)}</span>
                    <span>{format(new Date(session.start_time), 'dd/MM/yyyy HH:mm:ss')}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}