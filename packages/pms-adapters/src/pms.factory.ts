import type { PmsProvider } from '@hotel-bot/shared';
import { CloudbedsAdapter } from './cloudbeds.adapter';
import { LobbyPmsAdapter } from './lobby.adapter';
import type { PmsAdapter } from './pms.interface';

const adapters: Record<PmsProvider, PmsAdapter> = {
  cloudbeds: new CloudbedsAdapter(),
  lobby: new LobbyPmsAdapter(),
};

export function getPmsAdapter(provider: PmsProvider): PmsAdapter {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }
  return adapter;
}
