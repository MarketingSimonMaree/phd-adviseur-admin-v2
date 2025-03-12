import { supabase } from './supabase';

function checkHeyGenApiKey() {
  const apiKey = import.meta.env.VITE_HEYGEN_API_KEY;
  if (!apiKey || apiKey === 'your_heygen_api_key_here') {
    console.warn('HeyGen API key not found or not properly configured');
    return false;
  }
  return true;
}

export async function fetchHeyGenSessions() {
  if (!checkHeyGenApiKey()) {
    return { sessions: [] };
  }

  try {
    const response = await fetch(`${HEYGEN_API_BASE}/streaming.list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_HEYGEN_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('HeyGen API error:', errorData);
      return { sessions: [] };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error in fetchHeyGenSessions:', error);
    return { sessions: [] };
  }
}

export async function getHeyGenSessionStatus(sessionId: string) {
  if (!checkHeyGenApiKey()) {
    return { status: 'error', message: 'HeyGen API key not configured' };
  }

  try {
    const response = await fetch(`${HEYGEN_API_BASE}/streaming.get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_HEYGEN_API_KEY}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('HeyGen API error:', errorData);
      return { status: 'error', message: errorData.message || 'Failed to get session status' };
    }

    return response.json();
  } catch (error) {
    console.error('Error in getHeyGenSessionStatus:', error);
    return { status: 'error', message: 'Failed to get session status' };
  }
}

export async function stopHeyGenSession(sessionId: string) {
  if (!checkHeyGenApiKey()) {
    return { status: 'error', message: 'HeyGen API key not configured' };
  }

  try {
    const sessionStatus = await getHeyGenSessionStatus(sessionId);
    
    if (sessionStatus.status === 'completed') {
      return { status: 'completed', message: 'Session was already completed' };
    }

    const response = await fetch(`${HEYGEN_API_BASE}/streaming.stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_HEYGEN_API_KEY}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('HeyGen API error:', errorData);
      return { status: 'error', message: errorData.message || 'Failed to stop session' };
    }

    return response.json();
  } catch (error) {
    console.error('Error in stopHeyGenSession:', error);
    return { status: 'error', message: 'Failed to stop session' };
  }
}

export async function sendMessageToHeyGen(sessionId: string, message: string) {
  if (!checkHeyGenApiKey()) {
    return { status: 'error', message: 'HeyGen API key not configured' };
  }

  try {
    console.log('Sending message to HeyGen:', { sessionId, message });

    const response = await fetch(`${HEYGEN_API_BASE}/streaming.chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_HEYGEN_API_KEY}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('HeyGen API error:', errorData);
      return { status: 'error', message: errorData.message || 'Failed to send message' };
    }

    const data = await response.json();
    console.log('HeyGen response:', data);

    await syncHeyGenMessages(sessionId);

    return data;
  } catch (error) {
    console.error('Error in sendMessageToHeyGen:', error);
    return { status: 'error', message: 'Failed to send message' };
  }
}

export async function getAllActiveSessions() {
  try {
    if (!checkHeyGenApiKey()) {
      return [];
    }

    const response = await fetchHeyGenSessions();
    if (!response || !response.sessions) {
      console.log('No active sessions found or invalid response format');
      return [];
    }
    return response.sessions;
  } catch (error) {
    console.error('Error in getAllActiveSessions:', error);
    return [];
  }
}

export async function syncHeyGenMessages(sessionId: string) {
  try {
    // Eerst ophalen van bestaande berichten
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('message, timestamp')
      .eq('session_id', sessionId);

    // Nieuwe berichten ophalen van HeyGen
    const messages = await fetchHeyGenMessages(sessionId);
    
    // Alleen nieuwe berichten toevoegen die nog niet bestaan
    for (const message of messages) {
      const messageExists = existingMessages?.some(
        existing => existing.message === message.content
      );

      if (!messageExists) {
        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            sender: message.role === 'user' ? 'user' : 'avatar',
            message: message.content,
            timestamp: new Date(message.timestamp).toISOString(),
          });

        if (insertError) {
          console.error('Error inserting message:', insertError);
        }
      }
    }
  } catch (error) {
    console.error('Error in syncHeyGenMessages:', error);
  }
}