/**
 * React Hook for Offline Queue Management
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPendingQueue,
  removeFromQueue,
  getQueueCount,
  clearSyncedItems,
  updateQueueStatus,
  QueuedAttendance
} from '@/lib/offline-queue';

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    updatePendingCount();
    
    // Update count every 5 seconds
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  // Sync queue when back online
  const syncQueue = useCallback(async (submitAttendance: (data: any) => Promise<any>) => {
    if (!isOnline || syncing) return;

    setSyncing(true);

    try {
      const pending = await getPendingQueue();
      
      for (const item of pending) {
        try {
          await updateQueueStatus(item.id, 'syncing');
          
          const response = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              meetingId: item.meetingId,
              token: item.token,
              name: item.name,
              division: item.division,
              deviceId: item.deviceId,
              photo: item.photo,
              offline: true
            })
          });

          if (response.ok) {
            await removeFromQueue(item.id);
          } else {
            const data = await response.json();
            await updateQueueStatus(item.id, 'failed', data.error);
          }
        } catch (error: any) {
          await updateQueueStatus(item.id, 'failed', error.message);
        }
      }

      await clearSyncedItems();
      await updatePendingCount();
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing, updatePendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncQueue(async (data) => {
        const response = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return response.json();
      });
    }
  }, [isOnline, syncQueue]);

  return {
    isOnline,
    pendingCount,
    syncing,
    syncQueue,
    refreshCount: updatePendingCount
  };
}
