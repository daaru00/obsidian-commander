import * as os from 'os'
import CommanderPlugin from "main";
import { ButtonComponent, ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_OUTPUT = 'commander-output'

export default class OutputView extends ItemView {
  outputElem: HTMLElement;
  plugin: CommanderPlugin

  constructor(leaf: WorkspaceLeaf, plugin: CommanderPlugin) {
    super(leaf);
    this.plugin = plugin
  }

  getViewType(): string {
    return VIEW_TYPE_OUTPUT;
  }

  getDisplayText(): string {
    return 'Commander';
  }

  getIcon() {
    return "console";
  }

  async onOpen() {
    let { containerEl } = this;
    containerEl.empty();

    const buttonContainer = document.createElement("div")
    buttonContainer.addClass('nav-header')
    buttonContainer.addClass('commander-header')
    containerEl.appendChild(buttonContainer)

    new ButtonComponent(buttonContainer)
      .setIcon("copy")
      .setTooltip('Copy output')
      .onClick(() => {
        this.copyContentToClipboard()
      })

    new ButtonComponent(buttonContainer)
      .setIcon("cross")
      .setTooltip('Clear output')
      .onClick(() => {
        this.clear()
      })

    new ButtonComponent(buttonContainer)
      .setIcon("stop")
      .setTooltip('Stop running scripts')
      .onClick(() => {
        if (this.plugin.runningScripts.length > 0) {
          this.plugin.stopAllRunningScripts()
        }
      })

    this.outputElem = document.createElement("pre");
    this.outputElem.addClass('commander-output')
    containerEl.appendChild(this.outputElem)
  }

  clear() {
    this.outputElem.innerHTML = ""
  }

  copyContentToClipboard() {
    navigator.clipboard.writeText(this.outputElem.innerHTML.replace(/<br>/g, os.EOL))
  }

  print(msg: string) {
    msg = `${msg}`.replace(new RegExp(os.EOL, 'g'), '<br>')
    if (this.outputElem.innerHTML.length > 0 && this.outputElem.innerHTML.endsWith('<br>') === false) {
      this.outputElem.innerHTML += '<br>'
    }
    this.outputElem.innerHTML += msg

    this.checkMaxLines()
  }

  checkMaxLines() {
    let lines = this.outputElem.innerHTML.split('<br>')
    const overLimit = lines.length - this.plugin.settings.outputMaxLines
    if (overLimit <= 0) {
      return
    }

    lines = lines.slice(overLimit - 1)
    this.outputElem.innerHTML = lines.join('<br>')
  }
}
