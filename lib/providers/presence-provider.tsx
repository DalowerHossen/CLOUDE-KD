// path: lib/providers/presence-provider.tsx
'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import {
  HEARTBEAT_MS,
  computeLock,
  presenceTopic,
  type LockState,
  type PresenceEntry,
} from './presence-logic';

interface Identity {
  userId: string;
  name: string;
  /** Tenant of the signed-in user; null for platform staff. Provided by the server layout. */
  companyId: string | null;
}

const IdentityContext = createContext<Identity | null>(null);

export function PresenceProvider({
  identity,
  children,
}: {
  identity: Identity;
  children: ReactNode;
}): JSX.Element {
  return <IdentityContext.Provider value={identity}>{children}</IdentityContext.Provider>;
}

export interface PresenceApi {
  /** People currently on the page, without the current user. */
  others: readonly PresenceEntry[];
  lock: LockState;
  /** True when somebody else holds the edit lock. */
  lockedByOther: boolean;
  editing: boolean;
  startEditing: () => void;
  stopEditing: () => void;
}

/** Joins the presence channel of one resource, for example "invoice:<id>". */
export function usePresence(resource: string): PresenceApi {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error('usePresence must be used inside PresenceProvider.');
  const { userId, name, companyId } = identity;
  const [entries, setEntries] = useState<readonly PresenceEntry[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [editing, setEditing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const editingSinceRef = useRef<string | null>(null);

  const publish = useCallback(
    (isEditing: boolean): void => {
      const channel = channelRef.current;
      if (!channel) return;
      const payload: PresenceEntry = {
        userId,
        name,
        editing: isEditing,
        editingSince: isEditing ? (editingSinceRef.current ??= new Date().toISOString()) : null,
        heartbeatAt: new Date().toISOString(),
      };
      void channel.track(payload);
    },
    [userId, name],
  );

  useEffect(() => {
    const client = getBrowserSupabase();
    const channel = client.channel(presenceTopic({ companyId }, resource), {
      config: { private: true, presence: { key: userId } },
    });
    channelRef.current = channel;
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry>();
        setEntries(Object.values(state).flatMap((metas) => metas));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') publish(false);
      });
    return () => {
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [companyId, resource, userId, publish]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      publish(editing);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [editing, publish]);

  const lock = useMemo(() => computeLock(entries, now), [entries, now]);
  const others = useMemo(() => entries.filter((e) => e.userId !== userId), [entries, userId]);
  const lockedByOther = lock.holder !== null && lock.holder.userId !== userId;

  const startEditing = useCallback((): void => {
    editingSinceRef.current = new Date().toISOString();
    setEditing(true);
    publish(true);
  }, [publish]);
  const stopEditing = useCallback((): void => {
    editingSinceRef.current = null;
    setEditing(false);
    publish(false);
  }, [publish]);

  return { others, lock, lockedByOther, editing, startEditing, stopEditing };
}
