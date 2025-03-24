import { Notice, Plugin } from 'obsidian';

import Methods, { executeEagleScript, runShellScript } from './methods';
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
				const connectionPattern = /^(Modules\/40 Topic\/43\.00 Humanities\/43\.04 Connections|Modules\/40 Topic\/46\.00 Media\/46\.01 Music\/Artist\/.*|Data\/md\/YouTube\/YouTubeSubscriptionData\/.*)/;
				this.methods.writeCacheToJSON(connectionPattern, "connections.json");
				executeEagleScript();
			}
		});
		this.addCommand({
			id: 'update_courses',
			name: 'Update Courses',
			callback:  () => {
				const coursesPattern = /^Modules\/00 Tech\/01\.00 IT\/01\.06 Skills\/Learning\/Courses\/.*/;
				this.methods.writeCacheToJSON(coursesPattern, "courses.json");
				executeEagleScript();
			}
		});
	}

	onunload() {
		console.log('unloading Metadata Extractor plugin');
	}
}
