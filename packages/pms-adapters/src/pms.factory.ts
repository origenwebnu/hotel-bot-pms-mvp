import type { PmsProvider } from '@hotel-bot/shared';
import { CloudbedsAdapter } from './cloudbeds.adapter';
import { LobbyPmsAdapter } from './lobby.adapter';
import type { PmsAdapter } from './pms.interface';

type ExternalPmsProvider = Exclude<PmsProvider, 'local'>;

const adapters: Record<ExternalPmsProvider, PmsAdapter> = {
  cloudbeds: new CloudbedsAdapter(),
  lobby: new LobbyPmsAdapter(),
};

export function getPmsAdapter(provider: PmsProvider): PmsAdapter {
  if (provider === 'local') {
    throw new Error(
      'PMS local se gestiona en LocalInventoryService, no en pms-adapters',
    );
  }
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }
  return adapter;
}
