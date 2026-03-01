// QuiClick Sync Queue
// Shared helper for enqueuing sync operations from frontend pages.
// The background worker watches chrome.storage.onChanged for syncQueue
// changes and processes them.

/**
 * Enqueue a sync operation. Coalesces update_settings and reorder ops.
 *
 * @param {string} type - Operation type:
 *   'create_bookmark', 'update_bookmark', 'delete_bookmark',
 *   'create_folder', 'update_folder', 'delete_folder',
 *   'reorder', 'update_settings', 'full_push'
 * @param {object} payload - Operation-specific data
 */
export async function enqueueSync(type, payload) {
  const data = await chrome.storage.local.get("syncQueue");
  const queue = data.syncQueue || [];

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: Date.now(),
  };

  // Coalesce: for update_settings and reorder, replace any existing
  // pending entry of the same type (keep latest only)
  if (type === "update_settings" || type === "reorder") {
    const idx = queue.findIndex((item) => item.type === type);
    if (idx !== -1) {
      queue[idx] = entry;
    } else {
      queue.push(entry);
    }
  } else {
    queue.push(entry);
  }

  await chrome.storage.local.set({ syncQueue: queue });
}
