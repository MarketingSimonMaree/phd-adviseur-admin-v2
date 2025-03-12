import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2 } from 'lucide-react';

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Er ging iets mis bij het ophalen van de gebruikers.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Eerst een uitnodiging sturen via Supabase Auth
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(newUserEmail);
      if (inviteError) throw inviteError;

      // De gebruiker wordt automatisch toegevoegd aan de users tabel via de trigger
      await fetchUsers();
      setNewUserEmail('');
    } catch (err) {
      console.error('Error adding user:', err);
      setError('Er ging iets mis bij het toevoegen van de gebruiker.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Weet je zeker dat je deze gebruiker wilt verwijderen?')) return;

    try {
      // Verwijder eerst uit de users tabel
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (deleteError) throw deleteError;

      // Verwijder dan uit auth.users
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) throw authDeleteError;

      await fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Er ging iets mis bij het verwijderen van de gebruiker.');
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gebruikers Beheren</h1>
        
        <form onSubmit={handleAddUser} className="flex gap-2">
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="Email adres"
            className="border rounded-md px-3 py-2"
            required
          />
          <button
            type="submit"
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
          >
            <Plus className="h-4 w-4" />
            Gebruiker Toevoegen
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded-md mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Rol</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Aangemaakt op</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 text-sm text-gray-900">{user.email}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{user.role}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {new Date(user.created_at).toLocaleString('nl-NL')}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 