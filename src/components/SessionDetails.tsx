import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { syncHeyGenMessages } from '../lib/heygen';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Message {
  id: string;
  session_id: string;
  sender: 'user' | 'avatar';
  message: string;
  timestamp: string;
  created_at: string;
}

interface SessionDetailsProps {
  sessionId: string;
}

interface SessionStats {
  messageCount: number;
  duration: string | null;
  firstMessage: string | null;
  lastMessage: string | null;
}

export function SessionDetails({ sessionId }: SessionDetailsProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [stats, setStats] = useState<SessionStats>({
    messageCount: 0,
    duration: null,
    firstMessage: null,
    lastMessage: null
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    setNewMessageCount(0);
  }, [messages]);

  useEffect(() => {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
      
      if (isAtBottom) {
        setNewMessageCount(0);
      }
    };

    messagesContainer.addEventListener('scroll', handleScroll);
    return () => messagesContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const refreshMessages = async () => {
    if (!sessionId || isRefreshing) return;

    try {
      setIsRefreshing(true);
      await syncHeyGenMessages(sessionId);
      await fetchMessages();
    } catch (err) {
      console.error('Error refreshing messages:', err);
      setError(err instanceof Error ? err.message : 'Berichten vernieuwen mislukt');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchMessages = async () => {
    if (!sessionId) return;

    try {
      setIsLoading(true);
      setError(null);

      // First verify the session exists
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Sessie niet gevonden');
      }

      // Fetch messages with strict session_id filtering
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (messagesError) {
        throw messagesError;
      }

      if (messagesData) {
        setMessages(messagesData);
        
        // Bereken statistieken
        const firstMessage = new Date(messagesData[0].created_at);
        const lastMessage = new Date(messagesData[messagesData.length - 1].created_at);
        
        setStats({
          messageCount: messagesData.length,
          duration: formatDistanceToNow(firstMessage, {
            locale: nl,
            addSuffix: false
          }),
          firstMessage: firstMessage.toLocaleString('nl-NL'),
          lastMessage: lastMessage.toLocaleString('nl-NL')
        });
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err instanceof Error ? err.message : 'Berichten ophalen mislukt');
    } finally {
      setIsLoading(false);
    }
  };

  // Setup real-time subscription
  useEffect(() => {
    if (!sessionId) return;

    // Cleanup previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    fetchMessages();

    // Setup new subscription
    channelRef.current = supabase.channel(`messages_${sessionId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const messagesContainer = document.querySelector('.messages-container');
          const isAtBottom = messagesContainer 
            ? Math.abs(messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop) < 50
            : true;

          if (payload.eventType === 'INSERT') {
            setMessages(prev => {
              const newMessage = payload.new as Message;
              // Only add if it belongs to this session and isn't already present
              if (newMessage.session_id !== sessionId || prev.some(msg => msg.id === newMessage.id)) {
                return prev;
              }
              if (!isAtBottom) {
                setNewMessageCount(count => count + 1);
              }
              return [...prev, newMessage].sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              );
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedMessage = payload.old as Message;
            if (deletedMessage.session_id === sessionId) {
              setMessages(prev => prev.filter(msg => msg.id !== deletedMessage.id));
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new as Message;
            if (updatedMessage.session_id === sessionId) {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === updatedMessage.id ? updatedMessage : msg
                ).sort((a, b) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                )
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId]);

  useEffect(() => {
    const fetchStats = async () => {
      console.log('Fetching stats for session:', sessionId);
      const { data, error } = await supabase
        .from('session_stats')
        .select('*')
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error fetching stats:', error);
      } else {
        console.log('Fetched stats:', data);
        setStats(data[0]);
      }
    };

    if (sessionId) {
      fetchStats();
    }
  }, [sessionId]);

  const messageVariants = {
    initial: { 
      opacity: 0,
      y: 20,
      scale: 0.95
    },
    animate: { 
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 30
      }
    },
    exit: { 
      opacity: 0,
      scale: 0.9,
      transition: {
        duration: 0.2
      }
    }
  };

  if (!stats) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg shadow flex flex-col h-[calc(100vh-16rem)]">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Chat Sessie {sessionId}
          </h2>
          <button
            onClick={refreshMessages}
            disabled={isRefreshing}
            className="inline-flex items-center px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ce861b] disabled:opacity-50"
          >
            {isRefreshing ? 'Berichten verversen...' : 'Berichten verversen'}
          </button>
        </div>
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-red-50 border-l-4 border-red-400 text-red-700"
          >
            <p>{error}</p>
          </motion.div>
        )}

        <div className="flex-1 p-4 space-y-4 overflow-y-auto messages-container relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 180, 360]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-[#ce861b]"
              >
                <MessageSquare size={32} />
              </motion.div>
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-gray-500"
            >
              Geen berichten gevonden voor deze sessie
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  layout
                  variants={messageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={`flex ${
                    message.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-lg rounded-lg px-4 py-2 ${
                      message.sender === 'user'
                        ? 'bg-[#ce861b] text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {message.message}
                    </div>
                    <div className={`text-xs mt-1 ${
                      message.sender === 'user' ? 'text-[#ffd7a3]' : 'text-gray-500'
                    }`}>
                      {format(new Date(message.timestamp), 'HH:mm:ss')}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {newMessageCount > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-[#ce861b] text-white px-4 py-2 rounded-full shadow-lg hover:bg-[#b67616] transition-colors"
          >
            {newMessageCount} nieuwe {newMessageCount === 1 ? 'bericht' : 'berichten'}
          </motion.button>
        )}
      </div>

      
    </div>
  );
}