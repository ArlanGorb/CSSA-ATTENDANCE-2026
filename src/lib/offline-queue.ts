/**
 * Offline Queue Management for Attendance
 * Uses IndexedDB via localforage for persistent storage
 */

import localforage from 'localforage';

export interface QueuedAttendance {
  id: string;
  meetingId: string;
  token: string;
  name: string;
  division: string;
  deviceId: string;
  photo?: string;
  timestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  errorMessage?: string;
}

// Initialize localforage for attendance queue
const attendanceQueue = localforage.createInstance({
  name: 'presensi-cssa',
  storeName: 'attendance_queue',
  description: 'Queue for offline attendance submissions'
});

/**
 * Add attendance to queue
 */
export async function addToQueue(attendance: Omit<QueuedAttendance, 'id' | 'status' | 'timestamp'>): Promise<string> {
  const id = `attendance_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  const queuedItem: QueuedAttendance = {
    ...attendance,
    id,
    status: 'pending',
    timestamp: Date.now()
  };
  
  await attendanceQueue.setItem(id, queuedItem);
  return id;
}

/**
 * Get all pending items from queue
 */
export async function getPendingQueue(): Promise<QueuedAttendance[]> {
  const items: QueuedAttendance[] = [];
  
  await attendanceQueue.iterate((value: QueuedAttendance) => {
    if (value.status === 'pending' || value.status === 'failed') {
      items.push(value);
    }
  });
  
  return items.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Update queue item status
 */
export async function updateQueueStatus(
  id: string,
  status: QueuedAttendance['status'],
  errorMessage?: string
): Promise<void> {
  const item = await attendanceQueue.getItem<QueuedAttendance>(id);
  
  if (item) {
    await attendanceQueue.setItem(id, {
      ...item,
      status,
      errorMessage
    });
  }
}

/**
 * Remove item from queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  await attendanceQueue.removeItem(id);
}

/**
 * Get queue count
 */
export async function getQueueCount(): Promise<number> {
  let count = 0;
  
  await attendanceQueue.iterate((value: QueuedAttendance) => {
    if (value.status === 'pending' || value.status === 'failed') {
      count++;
    }
  });
  
  return count;
}

/**
 * Clear all synced items from queue
 */
export async function clearSyncedItems(): Promise<void> {
  const keysToDelete: string[] = [];
  
  await attendanceQueue.iterate((value: QueuedAttendance, key: string) => {
    if (value.status === 'synced') {
      keysToDelete.push(key);
    }
  });
  
  for (const key of keysToDelete) {
    await attendanceQueue.removeItem(key);
  }
}

/**
 * Get all queue items (for UI display)
 */
export async function getAllQueueItems(): Promise<QueuedAttendance[]> {
  const items: QueuedAttendance[] = [];
  
  await attendanceQueue.iterate((value: QueuedAttendance) => {
    items.push(value);
  });
  
  return items.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Check if user has pending attendance in queue
 */
export async function hasPendingAttendance(name: string, meetingId: string): Promise<boolean> {
  const pending = await getPendingQueue();
  return pending.some(item => item.name === name && item.meetingId === meetingId);
}
