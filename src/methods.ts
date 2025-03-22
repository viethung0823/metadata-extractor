import type BridgePlugin from './main';
import {
	App,
	CachedMetadata,
	EmbedCache,
	FileSystemAdapter,
	FrontMatterCache,
	getAllTags,
	getLinkpath,
	LinkCache,
	Notice,
	parseFrontMatterAliases,
	TAbstractFile,
	TFile,
	TFolder,
} from 'obsidian';
import type {
	backlinks,
	extendedFrontMatterCache, file,
	folder,
	links,
	Metadata
} from './interfaces';
import { writeFileSync } from 'fs';
//@ts-expect-error, there is no export, but this is how the esbuild inline plugin works
import Worker from './workers/metadata.worker';
import { getAllExceptMd } from './utils';

function getAll(allFiles: TAbstractFile[]) {
	const folders: folder[] = [];
	const files: file[] = [];

	for (const TAFile of allFiles) {
		if (TAFile instanceof TFolder) {
			folders.push({ name: TAFile.name, relativePath: TAFile.path });
		} else if (TAFile instanceof TFile) {
			files.push({
				name: TAFile.name,
				basename: TAFile.basename,
				relativePath: TAFile.path,
			});
		}
	}
	return { folders, files };
}

export default class Methods {
	app: App;
	plugin: BridgePlugin;
	constructor(plugin: BridgePlugin, app: App) {
		this.plugin = plugin;
		this.app = app;
	}

	// https://github.com/tillahoffmann/obsidian-jupyter/blob/e1e28db25fd74cd16844b37d0fe2eda9c3f2b1ee/main.ts#L175
	getAbsolutePath(fileName: string): string {
		let basePath;
		// base path
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			basePath = this.app.vault.adapter.getBasePath();
		} else {
			throw new Error('Cannot determine base path.');
		}
		// relative path
		const relativePath = `${this.app.vault.configDir}/plugins/metadata-extractor-mine/${fileName}`;
		// absolute path
		return `${basePath}/${relativePath}`;
	}

	/**
	 *
	 * @param currentCache - the object from Obsidian that contains all the metadata for the current file
	 * @returns - lower cased tags, duplicates are removed, stripped the #
	 */
	getUniqueTags(currentCache: CachedMetadata): string[] {
		let currentTags: string[] = [];
		const tags = getAllTags(currentCache);
		if (tags) {
			currentTags = tags;
		}
		currentTags = currentTags.map((tag) => tag.slice(1).toLowerCase());
		// remove duplicate tags in file
		currentTags = Array.from(new Set(currentTags));
		return currentTags;
	}

	writeAllExceptMd(fileName: string) {
		let path = this.plugin.settings.allExceptMdPath;
		// only change path not to be the plugin folder if the user entered a custom path
		if (!this.plugin.settings.allExceptMdPath) {
			path = this.getAbsolutePath(fileName);
		}
		const allFiles = this.app.vault.getAllLoadedFiles();
		const { folders, files } = getAll(allFiles);
		const foldersAndFiles = getAllExceptMd(folders, files);
		writeFileSync(path, JSON.stringify(foldersAndFiles, null, 2));

		if (this.plugin.settings.consoleLog) {
			console.log(
				'Metadata Extractor plugin: wrote the allExceptMd JSON file'
			);
		}
	}

	writeCanvases(fileName: string) {
		let path = this.plugin.settings.canvasPath;
		// only change path not to be the plugin folder if the user entered a custom path
		if (!this.plugin.settings.canvasPath) {
			path = this.getAbsolutePath(fileName);
		}
		const allFiles = this.app.vault.getAllLoadedFiles();
		const files: file[] = [];
		for (const TAFile of allFiles) {
			if (TAFile instanceof TFile) {
				if (TAFile.extension === 'canvas') {
					files.push({
						name: TAFile.name,
						basename: TAFile.basename,
						relativePath: TAFile.path,
					});
				}
			}
		}
		writeFileSync(path, JSON.stringify(files, null, 2));

		if (this.plugin.settings.consoleLog) {
			console.log(
				'Metadata Extractor plugin: wrote the canvas JSON file'
			);
		}
	}

	createCleanFrontmatter(
		frontmatter: FrontMatterCache
	): extendedFrontMatterCache {
		const newFrontmatter = Object.assign({}, frontmatter);
		if (newFrontmatter.aliases) {
			delete newFrontmatter.aliases;
		}
		if (newFrontmatter.tags) {
			delete newFrontmatter.tags;
		}
		if (newFrontmatter.image) {
			const imageRegex = /\[\[([^\]]+)\]\]/;

			const homeDir = process.env.HOME || process.env.USERPROFILE;
			newFrontmatter.image = newFrontmatter.image.replace(imageRegex, (match, p1) => {
					return `${homeDir}/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault/Data/Apps/Eagle/ObsidianAttachments.library/Symlink/${p1}`;
			});
		}
		return newFrontmatter as extendedFrontMatterCache;
	}

	writeCacheToJSON(pattern: RegExp, fileName: string) {
		// only set the path to the plugin folder if no other path is specified
		const	path = this.getAbsolutePath (fileName) ;
		let metadataCache: Metadata[] = [];

		for (const tfile of this.app.vault.getMarkdownFiles()) {
			const displayName = tfile.basename;
			const relativeFilePath: string = tfile.path;
			if (!pattern.test(relativeFilePath)) {
				continue;
		}
			let currentCache!: CachedMetadata;
			const cache = this.app.metadataCache.getFileCache(tfile);
			if (cache) {
				currentCache = cache;
			} else {
				console.log(`No cache for file: ${tfile.path}`);
				continue;
			}
			let currentAliases: string[];

			//@ts-expect-error, object needs to be initialized, but values will only be known later
			const metaObj: Metadata = {};

			metaObj.fileName = displayName;
			metaObj.relativePath = relativeFilePath;
			metaObj.uri = this.getFilepathURI(relativeFilePath);

			const currentTags = this.getUniqueTags(currentCache);
			if (currentTags) {
				if (currentTags.length > 0) {
					// metaObj.tags = currentTags;
					metaObj.stringTags = currentTags.map(tag => this.extractLastWord(tag)).join(' ');
				}
			}

			if (currentCache.frontmatter) {
				metaObj.frontmatter = this.createCleanFrontmatter(
					currentCache.frontmatter
				);
				//@ts-expect-error, could return null so can't be assigned to current aliases,
				// check for null is done later
				currentAliases = parseFrontMatterAliases(
					currentCache.frontmatter
				);
				if (currentAliases) {
					if (currentAliases.length > 0) {
						metaObj.aliases = currentAliases;
					}
				}
			}

			if (Object.keys(metaObj).length > 0) {
				metadataCache.push(metaObj);
			}
		}

		//backlinks
		const backlinkObj: backlinks[] = [];

		const worker = Worker();

		worker.postMessage([metadataCache, backlinkObj]);
		worker.onerror = (event: any) => {
			new Notice('Something went wrong with the backlinks calculation.');
		};
		worker.onmessage = (event: any) => {
			metadataCache = event.data;
			writeFileSync(path, JSON.stringify(metadataCache, null, 2));
			console.log(
				`wrote the ${fileName} JSON file`
			);
			// writeFileSync(path + 'cache.json', JSON.stringify(Object.entries(this.app.vault.getMarkdownFiles())))
			worker.terminate();
		};
	}

	getFilepathURI(filePath: string): string {
		const encodedFilePath = encodeURIComponent(filePath);
		return `obsidian://adv-uri?vault=${encodeURIComponent("Vault")}&filepath=${encodedFilePath}`;
	}

	extractLastWord(currentTags: string) {
		return currentTags.replace(/^.*\/([^\/]+)$/, '$1');
	}
}

function calculateLinks(
	currentCache: CachedMetadata,
	metaObj: Metadata,
	relativeFilePath: string,
	displayName: string,
	app: App,
	tfile: TFile
): Metadata {
	const currentLinks: links[] = [];
	let bothLinks: LinkCache[] & EmbedCache[] = [];

	linksAndOrEmbeds();

	function linksAndOrEmbeds(): void {
		let onlyLinks: LinkCache[] = [];
		let onlyEmbeds: EmbedCache[] = [];
		if (currentCache.links) {
			onlyLinks = currentCache.links;
		}
		if (currentCache.embeds) {
			onlyEmbeds = currentCache.embeds.filter((embed) => {
				const link = embed.link;
				const rawLink = getLinkpath(link);
				const dest = app.metadataCache.getFirstLinkpathDest(
					rawLink,
					tfile.path
				);
				if (dest) {
					return embed;
				}
			});
		}
		bothLinks = onlyLinks.concat(onlyEmbeds);
		getLinksAndEmbeds();
	}

	function getLinksAndEmbeds() {
		for (const links of bothLinks) {
			let fullLink = links.link;
			let aliasText = '';
			//@ts-expect-error, must be initialized for adding keys, but
			// TS interface requires certain keys, which will be added later
			const currentLinkObject: links = {};
			if (typeof links.displayText !== 'undefined') {
				aliasText = links.displayText;
			}
			// calculate relative path before truncating it
			const relPath = app.metadataCache.getFirstLinkpathDest(
				getLinkpath(fullLink),
				tfile.path
			);
			if (relPath) {
				// only include md links
				if (relPath.path.slice(-3).toLowerCase() !== '.md') {
					continue;
				}
			}

			// account for relative links
			if (fullLink.includes('/')) {
				//@ts-expect-error, it only takes the last element if it includes a slash
				fullLink = fullLink.split('/').last();
			}

			if (!fullLink.includes('#')) {
				currentLinkObject.link = fullLink;
				// account for alias
				if (aliasText !== fullLink) {
					currentLinkObject.displayText = aliasText;
				}
				// account for uncreated files
				if (relPath) {
					currentLinkObject.relativePath = relPath.path;
				}
			}
			// heading/block ref and maybe an alias, but not to the same file
			else if (fullLink.includes('#') && fullLink.charAt(0) !== '#') {
				const alias = aliasText;
				const cleanLink = getLinkpath(fullLink);
				currentLinkObject.link = fullLink;
				currentLinkObject.cleanLink = cleanLink;
				// it has an alias
				if (!aliasText.includes('#') || !aliasText.includes('>')) {
					currentLinkObject.displayText = alias;
				}
				// account for uncreated files
				if (relPath) {
					currentLinkObject.relativePath = relPath.path;
				}
			}
			// heading/block ref to same file and maybe alias
			else if (fullLink.charAt(0) === '#') {
				currentLinkObject.link = fullLink;
				currentLinkObject.relativePath = relativeFilePath;
				currentLinkObject.cleanLink = displayName;
				// account for alias
				if (fullLink !== aliasText) {
					currentLinkObject.displayText = aliasText;
				}
			}
			currentLinks.push(currentLinkObject);
		}
		if (currentLinks.length > 0) {
			metaObj.links = currentLinks;
		}
	}
	return metaObj;
}
