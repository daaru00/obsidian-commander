import { ButtonComponent, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import "./lib/icons"
import SettingTab, { getAllSupportedLanguages, PluginSettings } from './settings'
import { DEFAULT_SETTINGS } from './settings'
import Script from 'script'
import OutputView, { VIEW_TYPE_OUTPUT } from 'output';

export default class CommanderPlugin extends Plugin {
  settings: PluginSettings;
  editor: CodeMirror.Editor;
  runningScripts: Script[];
  outputView: OutputView;
  statusBarItem: HTMLElement;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SettingTab(this.app, this));

    this.statusBarItem = this.addStatusBarItem()
    this.registerInterval(window.setInterval(() => {
      this.statusBarItem.setText(`${this.runningScripts.length} running scripts`)
    }, 1000))

    this.registerView(
      VIEW_TYPE_OUTPUT,
      (leaf: WorkspaceLeaf) => {
        this.outputView = new OutputView(leaf, this)
        return this.outputView
      }
    );

    this.addCommand({
      id: 'app:show-commander-output',
      name: 'Show console output',
      callback: () => this.initLeaf(),
      hotkeys: []
    });

    this.addCommand({
      id: 'app:clean-commander-scripts',
      name: 'Clean console output',
      callback: () => {
        if (this.outputView) {
          this.outputView.clear()
        }
      },
      hotkeys: []
    });

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
    });

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
    });

    this.runningScripts = []

    this.registerMarkdownPostProcessor(this.postProcessor.bind(this))
  }

  clearLeaf() {
    const { workspace } = this.app
    workspace
      .getLeavesOfType(VIEW_TYPE_OUTPUT)
      .forEach((leaf) => leaf.detach());
  }

  initLeaf() {
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
    });
  }

  postProcessor(el: HTMLElement) {
    let codeBlocks = Array.from(el.querySelectorAll("code"))

    if (!codeBlocks.length) {
      return;
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
      codeBlock.parentElement.parentElement.appendChild(this.createWidget(script))
    }
  }

  createWidget(script: Script): HTMLElement {
    const widget = document.createElement("div");
    widget.addClass('commander-execute-container')

    const runBtn = new ButtonComponent(widget)
      .setIcon("run")
      .onClick(async () => {
        runBtn.setDisabled(true)

        this.runningScripts.push(script)

        try {
          await script.run()
        } catch (err) {
          console.log(err);
        } finally {
          this.runningScripts.splice(this.runningScripts.indexOf(script), 1)
          runBtn.setDisabled(false)
        }
      })

    if (this.settings.enableCopyButton) {
      new ButtonComponent(widget)
        .setIcon("copy")
        .onClick(() => {
          navigator.clipboard.writeText(script.content)
        })
    }

    return widget
  }

  stopAllRunningScripts() {
    for (const script of this.runningScripts) {
      script.command.kill()
    }
    this.runningScripts = []
  }

  async loadSettings() {
    let settings = await this.loadData()
    if (!settings || Object.keys(settings).length === 0) {
      settings = DEFAULT_SETTINGS
    }

    this.settings = settings
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.clearLeaf()
    this.stopAllRunningScripts()
  }
}
