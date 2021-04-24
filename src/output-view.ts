import * as os from 'os'
import CommanderPlugin from './main'
import { ButtonComponent, ItemView, WorkspaceLeaf } from 'obsidian'

// https://github.com/chalk/ansi-regex/blob/main/index.js#L3
export const ANSI_CODE_REGEX = [
	'[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
	'(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
].join('|')

export const VIEW_TYPE_OUTPUT = 'commander-output'

export default class OutputView extends ItemView {
	outputElem: HTMLElement;
	plugin: CommanderPlugin

	constructor(leaf: WorkspaceLeaf, plugin: CommanderPlugin) {
		super(leaf)
		this.plugin = plugin
	}

	getViewType(): string {
		return VIEW_TYPE_OUTPUT
	}

	getDisplayText(): string {
		return 'Commander'
	}

	getIcon(): string {
		return 'console'
	}

	async onOpen(): Promise<void> {
		const { containerEl } = this
		containerEl.empty()

		const buttonContainer = document.createElement('div')
		buttonContainer.addClass('nav-header')
		buttonContainer.addClass('commander-header')
		containerEl.appendChild(buttonContainer)

		new ButtonComponent(buttonContainer)
			.setIcon('copy')
			.setTooltip('Copy output')
			.onClick(() => {
				this.copyContentToClipboard()
			})

		new ButtonComponent(buttonContainer)
			.setIcon('cross')
			.setTooltip('Clear output')
			.onClick(() => {
				this.clear()
			})

		new ButtonComponent(buttonContainer)
			.setIcon('stop')
			.setTooltip('Stop running scripts')
			.onClick(() => {
				if (this.plugin.runningScripts.length > 0) {
					this.plugin.stopAllRunningScripts()
				}
			})

		this.outputElem = document.createElement('pre')
		this.outputElem.addClass('commander-output')
		containerEl.appendChild(this.outputElem)
	}

	clear(): void {
		this.outputElem.innerHTML = ''
	}

	copyContentToClipboard(): void {
		navigator.clipboard.writeText(this.outputElem.innerHTML.replace(/<br>/g, os.EOL))
	}

	print(msg: string): void {
		msg = msg.replace(new RegExp(ANSI_CODE_REGEX, 'g'), '') // remove ANSI control codes
		msg = msg.replace(new RegExp(os.EOL, 'g'), '<br>') // replace enw line with br
		
		if (this.outputElem.innerHTML.length > 0 && this.outputElem.innerHTML.endsWith('<br>') === false) {
			this.outputElem.innerHTML += '<br>'
		}
		this.outputElem.innerHTML += msg

		this.checkMaxLines()
		this.checkScroll()
	}

	checkMaxLines(): void {
		let lines = this.outputElem.innerHTML.split('<br>')
		const overLimit = lines.length - this.plugin.settings.outputMaxLines
		if (overLimit <= 0) {
			return
		}

		lines = lines.slice(overLimit - 1)
		this.outputElem.innerHTML = lines.join('<br>')
	}

	checkScroll(): void {
		if (!this.plugin.settings.enableAutoScroll) {
			return
		}

		this.outputElem.scrollTop = this.outputElem.scrollHeight
	}
}
