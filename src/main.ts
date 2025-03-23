import { Notice, Plugin } from 'obsidian';

import Methods, { runShellScript } from './methods';
import type { BridgeSettings } from './interfaces';
import { console } from 'node:inspector';

export default class BridgePlugin extends Plugin {
	settings!: BridgeSettings;
	methods = new Methods(this, this.app);

	async onload() {
		this.addCommand({
			id: 'update_connections',
			name: 'Update Connections',
			callback:  () => {
				const connectionPatter = /^(Modules\/40 Topic\/43\.00 Humanities\/43\.04 Connections|Modules\/40 Topic\/46\.00 Media\/46\.01 Music\/Artist\/.*|Data\/md\/YouTube\/YouTubeSubscriptionData\/.*)/;
				this.methods.writeCacheToJSON(connectionPatter, "connections.json");
				const homeDir = process.env.HOME || (process.env.USERPROFILE as string);
				const scriptPath = `${homeDir}/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault/Data/Apps/Alfred/Scripts/Eagle/create_eagle_obsidian_attachments_symlinks.sh`;
				setTimeout(async() => {
					try {
						await runShellScript(scriptPath);
						const msg = `Shell script executed successfully`
						console.log(msg);
						new Notice(msg);
					} catch (error) {
						console.error('Error executing shell script:', error);
					}
				}, 3000);
			}
		});
	}

	onunload() {
		console.log('unloading Metadata Extractor plugin');
	}
}
