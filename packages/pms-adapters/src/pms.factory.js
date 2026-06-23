"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPmsAdapter = getPmsAdapter;
const cloudbeds_adapter_1 = require("./cloudbeds.adapter");
const lobby_adapter_1 = require("./lobby.adapter");
const adapters = {
    cloudbeds: new cloudbeds_adapter_1.CloudbedsAdapter(),
    lobby: new lobby_adapter_1.LobbyPmsAdapter(),
};
function getPmsAdapter(provider) {
    const adapter = adapters[provider];
    if (!adapter) {
        throw new Error(`Unsupported PMS provider: ${provider}`);
    }
    return adapter;
}
//# sourceMappingURL=pms.factory.js.map