/**
 * Track active WebSocket connections per user so presence can
 * handle multiple open tabs. The map value is a simple counter
 * of how many sockets are currently registered for that user.
 */
const onlineUsers = new Map<string, number>();

/** Register a new socket for the given user */
export function userConnected(username: string) {
  const count = (onlineUsers.get(username) || 0) + 1;
  onlineUsers.set(username, count);
}

/** Remove a socket for the user and return whether they remain online */
export function userDisconnected(username: string): boolean {
  const count = (onlineUsers.get(username) || 0) - 1;
  if (count <= 0) {
    onlineUsers.delete(username);
    return false;
  }
  onlineUsers.set(username, count);
  return true;
}

/** Check if the given user currently has any active connections */
export function isOnline(username: string): boolean {
  return onlineUsers.has(username);
}

/** Expose a read-only list of usernames who are online */
export function listOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

export { onlineUsers };
