import "server-only";
import type { AlertChannel } from "./types";

const channelRegistry = new Map<string, AlertChannel>();

/**
 * Register an alert delivery channel. Overwrites existing registrations with the same id.
 */
export function registerChannel(channel: AlertChannel): void {
  channelRegistry.set(channel.id, channel);
}

/**
 * Retrieve a channel by its identifier.
 */
export function getChannel(id: string): AlertChannel | undefined {
  return channelRegistry.get(id);
}

/**
 * List all registered delivery channels.
 */
export function listChannels(): AlertChannel[] {
  return Array.from(channelRegistry.values());
}

/**
 * Unregister a channel by its identifier.
 */
export function unregisterChannel(id: string): boolean {
  return channelRegistry.delete(id);
}

/**
 * Clear all channel registrations (primarily used in testing).
 */
export function clearChannelRegistry(): void {
  channelRegistry.clear();
}
