import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Clock, MessageSquare, Users, BarChart2, LineChart as LineChartIcon } from 'lucide-react';

type DateFilter = 'yesterday' | '7days' | '14days' | '30days' | 'custom';
type TimeInterval = 'hour' | 'day' | 'week';
type ChartType = 'bar' | 'line';
type MetricType = 'sessions' | 'messages' | 'avgMessages' | 'avgDuration';

interface DashboardData {
  daily_sessions: {
    date: string;
    session_count: number;
  }[];
  message_counts: {
    session_id: string;
    created_at: string;
    message_count: number;
  }[];
}

export function DashboardStats() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('sessions');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [timeInterval, setTimeInterval] = useState<TimeInterval>('day');

  const getDateRange = (filter: DateFilter): { start: Date; end: Date } => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (filter) {
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case '7days':
        start.setDate(start.getDate() - 6);
        break;
      case '14days':
        start.setDate(start.getDate() - 13);
        break;
      case '30days':
        start.setDate(start.getDate() - 29);
        break;
      case 'custom':
        return {
          start: new Date(customStartDate),
          end: new Date(customEndDate)
        };
    }

    return { start, end };
  };

  useEffect(() => {
    const fetchData = async () => {
      const { start, end } = getDateRange(dateFilter);
      
      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        start_date: start.toISOString(),
        end_date: end.toISOString()
      });

      if (error) {
        console.error('Error:', error);
        return;
      }
      if (data && data[0]?.dashboard_data) {
        setDashboardData(data[0].dashboard_data);
      }
    };

    fetchData();
  }, [dateFilter, customStartDate, customEndDate]);

  if (!dashboardData) {
    return <div>Loading...</div>;
  }

  // Bereken totalen
  const totalSessions = dashboardData.daily_sessions.reduce((sum, day) => sum + day.session_count, 0);
  const totalMessages = dashboardData.message_counts.reduce((sum, msg) => sum + msg.message_count, 0);
  const avgMessagesPerSession = Math.round(totalMessages / totalSessions);

  const getChartData = (metric: MetricType) => {
    let data = [];
    
    switch (metric) {
      case 'sessions':
        data = dashboardData.daily_sessions.map(d => ({
          date: d.date,
          value: d.session_count,
          label: 'Aantal sessies'
        }));
        break;
      case 'messages':
        // Groepeer berichten per dag
        data = Object.entries(
          dashboardData.message_counts.reduce((acc, curr) => {
            const date = curr.created_at.split('T')[0];
            acc[date] = (acc[date] || 0) + curr.message_count;
            return acc;
          }, {} as Record<string, number>)
        ).map(([date, count]) => ({
          date,
          value: count,
          label: 'Aantal berichten'
        }));
        break;
      case 'avgMessages':
        // Bereken gemiddeld aantal berichten per sessie per dag
        data = dashboardData.daily_sessions.map(d => {
          const messagesOnDay = dashboardData.message_counts
            .filter(m => m.created_at.startsWith(d.date))
            .reduce((sum, m) => sum + m.message_count, 0);
          return {
            date: d.date,
            value: d.session_count ? Number((messagesOnDay / d.session_count).toFixed(1)) : 0,
            label: 'Gem. berichten per sessie'
          };
        });
        break;
      case 'avgDuration':
        // Placeholder voor gemiddelde sessieduur - aan te passen als we de echte data hebben
        data = dashboardData.daily_sessions.map(d => ({
          date: d.date,
          value: 12, // Dit moet vervangen worden door echte sessieduur data
          label: 'Gem. sessieduur (min)'
        }));
        break;
    }

    // Groepeer data op basis van het gekozen interval
    if (timeInterval === 'week') {
      return data.reduce((acc, item) => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay()); // Begin van de week
        const weekKey = weekStart.toISOString().split('T')[0];
        
        const existingWeek = acc.find(w => w.date === weekKey);
        if (existingWeek) {
          existingWeek.value += item.value;
        } else {
          acc.push({
            date: weekKey,
            value: item.value,
            label: item.label
          });
        }
        return acc;
      }, [] as typeof data);
    } else if (timeInterval === 'hour') {
      // Voor uur-interval, gebruik de volledige timestamp
      return dashboardData.message_counts.reduce((acc, curr) => {
        const hour = curr.created_at.split(':')[0] + ':00'; // Rond af naar het uur
        const existingHour = acc.find(h => h.date === hour);
        if (existingHour) {
          existingHour.value += curr.message_count;
        } else {
          acc.push({
            date: hour,
            value: curr.message_count,
            label: 'Aantal berichten'
          });
        }
        return acc;
      }, [] as typeof data).sort((a, b) => a.date.localeCompare(b.date));
    }

    return data;
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        
        <div className="flex gap-4 items-center">
          <select 
            className="border rounded-md p-2"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          >
            <option value="yesterday">Gisteren</option>
            <option value="7days">Afgelopen 7 dagen</option>
            <option value="14days">Afgelopen 14 dagen</option>
            <option value="30days">Afgelopen 30 dagen</option>
            <option value="custom">Aangepast</option>
          </select>

          {dateFilter === 'custom' && (
            <div className="flex gap-2">
              <input
                type="date"
                className="border rounded-md p-2"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
              <span>tot</span>
              <input
                type="date"
                className="border rounded-md p-2"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Stats cards - nu met 4 kolommen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Totaal Aantal Sessies</p>
              <p className="text-2xl font-semibold">{totalSessions}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Totaal Aantal Berichten</p>
              <p className="text-2xl font-semibold">{totalMessages}</p>
            </div>
            <MessageSquare className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Gem. Berichten per Sessie</p>
              <p className="text-2xl font-semibold">{avgMessagesPerSession}</p>
            </div>
            <MessageSquare className="h-8 w-8 text-purple-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Gem. Sessieduur</p>
              <p className="text-2xl font-semibold">12m</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Chart controls en grafiek */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-4 items-center">
              <select 
                className="border rounded-md p-2"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
              >
                <option value="sessions">Totaal Aantal Sessies</option>
                <option value="messages">Totaal Aantal Berichten</option>
                <option value="avgMessages">Gem. Berichten per Sessie</option>
                <option value="avgDuration">Gem. Sessieduur</option>
              </select>

              <select
                className="border rounded-md p-2"
                value={timeInterval}
                onChange={(e) => setTimeInterval(e.target.value as TimeInterval)}
              >
                <option value="hour">Per uur</option>
                <option value="day">Per dag</option>
                <option value="week">Per week</option>
              </select>

              <div className="flex gap-2 border rounded-md">
                <button
                  className={`p-2 ${chartType === 'bar' ? 'bg-gray-100' : ''}`}
                  onClick={() => setChartType('bar')}
                  title="Staafdiagram"
                >
                  <BarChart2 className="h-5 w-5" />
                </button>
                <button
                  className={`p-2 ${chartType === 'line' ? 'bg-gray-100' : ''}`}
                  onClick={() => setChartType('line')}
                  title="Lijndiagram"
                >
                  <LineChartIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: '400px', overflowX: 'auto' }}>
            {chartType === 'bar' ? (
              <BarChart
                width={1200}  // Bredere grafiek
                height={400}  // Hogere grafiek
                data={getChartData(selectedMetric)}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  angle={-45}  // Schuine labels
                  textAnchor="end"  // Uitlijning van labels
                  height={60}  // Meer ruimte voor labels
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" name={getChartData(selectedMetric)[0]?.label} />
              </BarChart>
            ) : (
              <LineChart
                width={1200}  // Bredere grafiek
                height={400}  // Hogere grafiek
                data={getChartData(selectedMetric)}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date"
                  angle={-45}  // Schuine labels
                  textAnchor="end"  // Uitlijning van labels
                  height={60}  // Meer ruimte voor labels
                />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  name={getChartData(selectedMetric)[0]?.label} 
                />
              </LineChart>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}