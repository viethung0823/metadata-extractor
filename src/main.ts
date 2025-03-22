import { Plugin } from 'obsidian';

import Methods from './methods';
import type { BridgeSettings } from './interfaces';
import { console } from 'node:inspector';

export default class BridgePlugin extends Plugin {
	settings!: BridgeSettings;
	methods = new Methods(this, this.app);

	async onload() {
		this.addCommand({
			id: 'update_connections',
			name: 'Update Connections',
			callback: () => {
				const connectionPatter = /^(Modules\/40 Topic\/43\.00 Humanities\/43\.04 Connections|Modules\/40 Topic\/46\.00 Media\/46\.01 Music\/Artist\/.*)/;
				this.methods.writeCacheToJSON(connectionPatter, "connections.json");
			},
		});
	}

	onunload() {
		console.log('unloading Metadata Extractor plugin');
	}
}
