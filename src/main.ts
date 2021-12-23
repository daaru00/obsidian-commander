import { ButtonComponent, Notice, Plugin, WorkspaceLeaf } from 'obsidian'
import './lib/icons'
import { getAllSupportedLanguages, PluginSettings } from './settings'
import SettingTab from './settings-tab'
import { DEFAULT_SETTINGS } from './settings'
import Script from './script'
import OutputView, { VIEW_TYPE_OUTPUT } from './output-view'

export default class CommanderPlugin extends Plugin {
	settings: PluginSettings;
	editor: CodeMirror.Editor;
	runningScripts: Script[];
	outputView: OutputView;
	statusBarItem: HTMLElement;

	async onload(): Promise<void> {
		await this.loadSettings()
		this.addSettingTab(new SettingTab(this.app, this))

		if (this.settings.enableStatusBarItem) {
			this.initStatusBarItem()
		}

		this.registerInterval(window.setInterval(() => {
			if (this.statusBarItem) {
				this.statusBarItem.setText(`${this.runningScripts.length} running scripts`)
			}
		}, 1000))

		this.registerView(
			VIEW_TYPE_OUTPUT,
			(leaf: WorkspaceLeaf) => {
				this.outputView = new OutputView(leaf, this)
				return this.outputView
			}
		)

		this.addCommand({
			id: 'app:show-commander-output',
			name: 'Show console output',
			callback: () => this.initLeaf(),
			hotkeys: []
		})

		this.addCommand({
			id: 'app:clean-commander-scripts',
			name: 'Clean console output',
			callback: () => {
				if (this.outputView) {
					this.outputView.clear()
				}
			},
			hotkeys: []
		})

		this.addCommand({
			id: 'app:copy-commander-scripts',
			name: 'Copy console output',
			callback: () => {
				if (this.outputView) {
					this.outputView.copyContentToClipboard()
					new Notice('Console output copied!')
				}
			},
			hotkeys: []
		})

		this.addCommand({
			id: 'app:stop-commander-scripts',
			name: 'Stop all commands',
			callback: () => {
				const scriptCount = this.runningScripts.length
				if (scriptCount === 0) {
					new Notice('No running scrips found')
					return
				}
				this.stopAllRunningScripts()
				new Notice(`${scriptCount} scripts stopped`)
			},
			hotkeys: []
		})

		this.runningScripts = []

		this.registerMarkdownPostProcessor(this.postProcessor.bind(this))
	}

	initStatusBarItem(): void {
		if (this.statusBarItem) {
			return
		}

		this.statusBarItem = this.addStatusBarItem()
	}

	clearStatusBarItem(): void {
		if (!this.statusBarItem) {
			return
		}
		this.statusBarItem.remove()
		this.statusBarItem = null
	}

	initLeaf(): void {
		const { workspace } = this.app

		if (workspace.getLeavesOfType(VIEW_TYPE_OUTPUT).length > 0) {
			return
		}

		const leaf = workspace.getRightLeaf(false)
		if (!leaf) {
			return
		}

		leaf.setViewState({
			type: VIEW_TYPE_OUTPUT,
      active: true,
		})
	}

	clearLeaf(): void {
		const { workspace } = this.app
		workspace
			.getLeavesOfType(VIEW_TYPE_OUTPUT)
			.forEach((leaf) => leaf.detach())
	}

	postProcessor(el: HTMLElement): void {
		const codeBlocks = Array.from(el.querySelectorAll('code'))

		if (!codeBlocks.length) {
			return
		}

		const supportedLanguages = getAllSupportedLanguages(this.settings)

		for (const codeBlock of codeBlocks) {
			const supportedLang = Array.from(codeBlock.classList).find(cls => {
				const match = cls.match('^language-(' + supportedLanguages + ')$')
				return match !== null
			})

			if (!supportedLang) {
				continue
			}

			const script = new Script(this)
			script.addContent(codeBlock.getText())
			script.setType(supportedLang.replace('language-', ''))

			codeBlock.parentElement.parentElement.addClass('commander-block-relative')
			this.createButton(script, codeBlock.parentElement)
		}
	}

	createButton(script: Script, parent: HTMLElement): void {
		const runBtn = new ButtonComponent(parent)
			.setButtonText('Execute')
			.setClass('execute-code-button')
			.onClick(async () => {
				runBtn.setDisabled(true)

				this.runningScripts.push(script)

				try {
					await script.run()
				} finally {
					this.runningScripts.splice(this.runningScripts.indexOf(script), 1)
					runBtn.setDisabled(false)
				}
			})
	}

	stopAllRunningScripts(): void {
		for (const script of this.runningScripts) {
			script.command.kill()
		}
		this.runningScripts = []
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings(): Promise<void> {
		if (this.settings.enableStatusBarItem) {
			this.initStatusBarItem()
		} else {
			this.clearStatusBarItem()
		}

		await this.saveData(this.settings)
	}

	onunload(): void {
		this.clearLeaf()
		this.stopAllRunningScripts()
	}
}
