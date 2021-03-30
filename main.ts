import { App, ButtonComponent, ItemView, Notice, Plugin, PluginSettingTab, Setting, TextComponent, WorkspaceLeaf } from 'obsidian';
import "./lib/icons"
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { getLanguageSettings, getAllSupportedLanguages, PluginSettings } from './settings'
import { DEFAULT_SETTINGS, CONTENT_PLACEHOLDER, FILE_PLACEHOLDER } from './settings'

const VIEW_TYPE_OUTPUT = 'commander-output'
const OUTPUT_MIN_LINES = 5
const OUTPUT_MAX_LINES = 5000

class Script {
  plugin: CommanderPlugin;
  content: string;
  type: string;
  command: ChildProcessWithoutNullStreams;

  constructor(plugin: CommanderPlugin) {
    this.plugin = plugin
  }

  setType(type: string) {
    this.type = type
  }

  addContent(content: string) {
    if (!this.content) {
      this.content = content
    } else {
      this.content += '\n' + content
    }
  }

  async run(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.plugin.settings.outputAutoClear && this.plugin.outputView) {
        this.plugin.outputView.clear()
      }

      const langSettings = getLanguageSettings(this.plugin.settings, this.type)
      if (!langSettings) {
        return
      }

      const id = (new Date()).getTime()
      const filePath = path.join(this.plugin.settings.tmpDir, `${id}.${this.type}`)

      const cmd = langSettings.executable.replace(FILE_PLACEHOLDER, filePath)
      let args = cmd.split(' ')
      const executable = args.shift()

      if (!executable) {
        return
      }

      let fileContent = this.content
      if (langSettings.template) {
        fileContent = langSettings.template.replace(CONTENT_PLACEHOLDER, fileContent)
      }

      fs.writeFileSync(filePath, fileContent)

      this.command = spawn(executable, args)
      this.command.stdout.on('data', (data) => {
        this.print(data.toString())
      });

      this.command.stderr.on('data', (data) => {
        this.print(data.toString())
      });

      this.command.on('error', (error) => {
        this.print(error.message)
      });

      this.command.on('exit', (code) => {
        fs.unlinkSync(filePath)
        if (code !== 0) {
          if (code === null) {
            this.print(`stopped`)
          } else {
            this.print(`exit code ${code}`)
          }
          reject(code)
        } else {
          resolve()
        }
      });
    })
  }

  print(msg: string) {
    if (this.plugin.outputView) {
      this.plugin.outputView.print(msg)
    }
  }
}

export default class CommanderPlugin extends Plugin {
  settings: PluginSettings;
  editor: CodeMirror.Editor;
  runningScripts: Script[];
  outputView: OutputView;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SampleSettingTab(this.app, this));

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

      codeBlock.parentElement.addClass('commander-block-relative')
      codeBlock.parentElement.appendChild(this.createWidget(script))
    }
  }

  createWidget(script: Script): HTMLElement {
    const widget = document.createElement("div");
    widget.addClass('commander-execute-container')

    const runBtn = new ButtonComponent(widget)
      .setIcon("run")
      .onClick(async () => {
        runBtn.setDisabled(true)

        const newScriptsLength = this.runningScripts.push(script)

        try {
          await script.run()
        } catch (err) {
          console.log(err);
        } finally {
          this.runningScripts.splice(newScriptsLength - 1, 1)

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
    if (Object.keys(settings).length === 0) {
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

class SampleSettingTab extends PluginSettingTab {
  plugin: CommanderPlugin;

  constructor(app: App, plugin: CommanderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Enable copy button')
      .setDesc('Add a copy button to code blocks')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableCopyButton)
        .onChange(async value => {
          this.plugin.settings.enableCopyButton = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Output automatic clean')
      .setDesc('Clear the output panel content before new executions')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.outputAutoClear)
        .onChange(async value => {
          this.plugin.settings.outputAutoClear = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Max output lines')
      .setDesc('The max number of lines to show in output panel')
      .addText(text => text
        .setValue(this.plugin.settings.outputMaxLines.toString())
        .onChange(async text => {
          let value = parseInt(text)
          if (value < OUTPUT_MIN_LINES) {
            value = OUTPUT_MIN_LINES
          } else if (value > OUTPUT_MAX_LINES) {
            value = OUTPUT_MAX_LINES
          }
          this.plugin.settings.outputMaxLines = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Temporary directory')
      .setDesc('The path where command are executed')
      .addText(text => text
        .setValue(this.plugin.settings.tmpDir)
        .onChange(async value => {
          this.plugin.settings.tmpDir = value
          await this.plugin.saveSettings()
        })
      )
    
    const languagesEl = window.createDiv()
    for (const key in this.plugin.settings.languages) {
      this.addLanguageSettings(languagesEl, key)
    }
    containerEl.appendChild(languagesEl)

    let textComponent: TextComponent
    new Setting(containerEl)
      .setName("New language key")
      .setDesc("The key must correspond to code block type")
      .addText(text => {
        textComponent = text
        text.setPlaceholder("js|javascript")
      })
      .addExtraButton(btn => btn
        .setIcon('add')
        .setTooltip("Add a new language")
        .onClick(async () => {
          const key = textComponent.getValue()

          this.plugin.settings.languages[key] = {
            executable: key.split('|').shift() + ' ' + FILE_PLACEHOLDER,
            template: CONTENT_PLACEHOLDER
          }
          await this.plugin.saveSettings()

          this.addLanguageSettings(languagesEl, textComponent.getValue())
          textComponent.setValue('')
        })
      )
  }

  addLanguageSettings(containerEl: HTMLElement, key: string) {
    const languagesSettingsContainer = containerEl.createEl('div', { cls: ['commander-lang-settings'] })
    languagesSettingsContainer.createEl('h2', { text: key.replace(/\|/g, ' ') });

    new Setting(languagesSettingsContainer)
      .setName('Executable')
      .setDesc(`Use ${FILE_PLACEHOLDER} as script file path placeholder`)
      .addText(text => text
        .setValue(this.plugin.settings.languages[key].executable)
        .onChange(async value => {
          this.plugin.settings.languages[key].executable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(languagesSettingsContainer)
      .setName('Template')
      .setDesc(`Use ${CONTENT_PLACEHOLDER} as script file path placeholder`)
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.languages[key].template)
        .onChange(async value => {
          this.plugin.settings.languages[key].template = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(languagesSettingsContainer)
      .addButton(btn => btn
        .setButtonText("Remove language")
        .onClick(async () => {
          languagesSettingsContainer.remove()
          delete this.plugin.settings.languages[key]
          await this.plugin.saveSettings()
        })
      )
  }
}

class OutputView extends ItemView {
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
      .setTooltip('Copy all')
      .onClick(() => {
        this.copyContentToClipboard()
      })

    new ButtonComponent(buttonContainer)
      .setIcon("cross")
      .setTooltip('Clear all')
      .onClick(() => {
        this.clear()
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
