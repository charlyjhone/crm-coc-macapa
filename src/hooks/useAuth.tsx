import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LAST_ACTIVITY_KEY = 'crm_last_activity';
const INACTIVITY_LIMIT_MS = 40 * 60 * 1000;

function lastActivity(userId: string): number | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_ACTIVITY_KEY) ?? 'null');
    return saved?.userId === userId && Number.isFinite(saved?.at) ? saved.at : null;
  } catch {
    return null;
  }
}

function keepSameUser(current: User | null, next: User | null): User | null {
  if (current && next && current.id === next.id && current.email === next.email &&
      JSON.stringify(current.user_metadata ?? {}) === JSON.stringify(next.user_metadata ?? {})) {
    return current;
  }
  return next;
}

function recordActivity(userId: string, at = Date.now()) {
  localStorage.setItem(LAST_ACTIVITY_KEY, JSON.stringify({ userId, at }));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const loginPending = useRef(false);
  const logoutPending = useRef(false);

  const expireIfIdle = (activeUser: User): boolean => {
    const last = lastActivity(activeUser.id);
    if (last !== null && last <= Date.now() && Date.now() - last < INACTIVITY_LIMIT_MS) return false;
    if (!logoutPending.current) {
      logoutPending.current = true;
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      setUser(null);
      setSession(null);
      // Supabase advises against awaiting an auth call inside its auth callback.
      setTimeout(() => {
        void supabase.auth.signOut({ scope: 'local' }).finally(() => {
          logoutPending.current = false;
        });
      }, 0);
    }
    return true;
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && loginPending.current && session?.user) {
          recordActivity(session.user.id);
          loginPending.current = false;
        }
        if (session?.user && expireIfIdle(session.user)) {
          setLoading(false);
          return;
        }
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(LAST_ACTIVITY_KEY);
        }
        setSession(session);
        // Ao voltar para a aba, o Supabase reconfirma a sessão (SIGNED_IN/TOKEN_REFRESHED).
        // Mantém o mesmo objeto se o usuário não mudou, para as telas não recarregarem.
        setUser((current) => keepSameUser(current, session?.user ?? null));
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (logoutPending.current) return;
      if (session?.user && expireIfIdle(session.user)) {
        setLoading(false);
        return;
      }
      setSession(session);
      setUser((current) => keepSameUser(current, session?.user ?? null));
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let lastWrite = 0;
    const check = () => { expireIfIdle(user); };
    const onActivity = () => {
      if (document.visibilityState === 'hidden' || expireIfIdle(user)) return;
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      recordActivity(userId, now);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY || event.key === null) check();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    window.addEventListener('focus', check);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, 10_000);
    check();
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity));
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [user]);

  // Registra a última vez que o usuário usou o sistema (qualquer clique).
  // Faz upsert ao logar e a cada clique, com throttle de 15s para não floodear.
  useEffect(() => {
    if (!user) return;
    let lastSent = 0;
    const ping = async () => {
      const now = Date.now();
      if (now - lastSent < 15_000) return;
      lastSent = now;
      try {
        await supabase.from('user_presence').upsert({
          user_id: user.id,
          last_seen_at: new Date().toISOString(),
          last_path: window.location.pathname,
          updated_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn('user_presence ping failed', e);
      }
    };
    ping();
    const onClick = () => ping();
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    loginPending.current = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error as Error | null };
    } finally {
      loginPending.current = false;
    }
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
