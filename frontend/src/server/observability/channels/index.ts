import "server-only";
import { inAppChannel } from "./inApp";
import { emailChannel } from "./email";
import { telegramChannel } from "./telegram";
import { discordChannel } from "./discord";
import { webhookChannel } from "./webhook";
import {
  clearChannelRegistry,
  getChannel,
  listChannels,
  registerChannel,
  unregisterChannel,
} from "./registry";

export * from "./types";
export * from "./registry";
export * from "./inApp";
export * from "./email";
export * from "./telegram";
export * from "./discord";
export * from "./webhook";

/**
 * Register all built-in standard channels.
 */
export function registerBuiltinChannels(): void {
  registerChannel(inAppChannel);
  registerChannel(emailChannel);
  registerChannel(telegramChannel);
  registerChannel(discordChannel);
  registerChannel(webhookChannel);
}

registerBuiltinChannels();
