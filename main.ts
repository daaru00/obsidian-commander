import { App, ButtonComponent, ItemView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import "./lib/icons"
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'

interface CommanderPluginSettings {
  enableCopyButton: boolean;
  outputAutoClear: boolean;
  outputMaxLines: number;
  tmpDir: string;
  shExecutable: string;
  shTemplate: string;
  bashExecutable: string;
  bashTemplate: string;
  jsExecutable: string;
  jsTemplate: string;
  pythonExecutable: string;
  pythonTemplate: string;
  goExecutable: string;
  goTemplate: string;
}

const DEFAULT_SETTINGS: CommanderPluginSettings = {
  enableCopyButton: true,
  outputAutoClear: false,
  outputMaxLines: 50,
  tmpDir: os.tmpdir(),
  shExecutable: '',
  shTemplate: '#!/bin/sh\n\nset -e\n\n%CONTENT%',
  bashExecutable: '',
  bashTemplate: '#!/bin/bash\n\nset -e\n\n%CONTENT%',
  jsExecutable: '',
  jsTemplate: '(async () => {\n\t%CONTENT%\n})()',
  pythonExecutable: '',
  pythonTemplate: '%CONTENT%',
  goExecutable: '',
  goTemplate: 'package main\n\nimport ("fmt")\n\nfunc main() {\n\t%CONTENT%\n}',
}

const DEFAULT_LINUX_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
  bashExecutable: "/bin/bash",
  shExecutable: "/bin/sh",
  jsExecutable: "/usr/bin/node",
  pythonExecutable: "/usr/bin/python",
  goExecutable: "/usr/local/go/bin/go",
}
const DEFAULT_MAC_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
  bashExecutable: "/bin/bash",
  shExecutable: "/bin/sh",
  jsExecutable: "/usr/local/bin/node",
  pythonExecutable: "/usr/bin/python",
  goExecutable: "/usr/local/go/bin",
}
const DEFAULT_WINDOWS_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
}

const VIEW_TYPE_OUTPUT = 'commander-output'
const SUPPORTED_SCRIPT_TAGS = 'bash|sh|js|javascript|python|go'
const CONTENT_PLACEHOLDER= '%CONTENT%'
const TEXT_ANIMATION_TIME = 1000
const OUTPUT_MIN_LINES = 5
const OUTPUT_MAX_LINES = 5000

class Script {
  outputView: OutputView;
  editor: CodeMirror.Editor;
  content: string;
  type: string;
  settings: CommanderPluginSettings;
  command: ChildProcessWithoutNullStreams;

  constructor(outputView: OutputView, settings: CommanderPluginSettings) {
    this.outputView = outputView
    this.settings = settings
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
      if (this.settings.outputAutoClear) {
        this.outputView.clear()
      }
      const id = (new Date()).getTime()
      const filePath = path.join(this.settings.tmpDir, `${id}.${this.type}`)

      let executable = null
      let args = []
      let fileContent = this.content
      
      switch (this.type) {
        case 'sh':
          executable = this.settings.shExecutable
          args = [filePath]
          fileContent = this.settings.shTemplate.replace(CONTENT_PLACEHOLDER, fileContent)
          break;
        case 'bash':
          executable = this.settings.bashExecutable
          args = [filePath]
          fileContent = this.settings.bashTemplate.replace(CONTENT_PLACEHOLDER, fileContent)
          break;
        case 'js':
        case 'javascript':
          executable = this.settings.jsExecutable
          args = [filePath]
          fileContent = this.settings.jsTemplate.replace(CONTENT_PLACEHOLDER, fileContent)
          break;
        case 'python':
          executable = this.settings.pythonExecutable
          args = [filePath]
          fileContent = this.settings.pythonTemplate.replace(CONTENT_PLACEHOLDER, fileContent)
          break;
        case 'go':
          executable = this.settings.goExecutable
          args = ['run', filePath]
          fileContent = this.settings.goTemplate.replace(CONTENT_PLACEHOLDER, fileContent)
          break;
        default:
          return reject(-1)
      }
      
      fs.writeFileSync(filePath, fileContent)

      this.command = spawn(executable, args)
      this.command.stdout.on('data', (data) => {
        this.outputView.print(data.toString())
      });

      this.command.stderr.on('data', (data) => {
        this.outputView.print(data.toString())
      });

      this.command.on('error', (error) => {
        this.outputView.print(error.message)
      });

      this.command.on('exit', (code) => {
        fs.unlinkSync(filePath)
        if (code !== 0) {
          this.outputView.print(`exit code ${code}`)
          reject(code)
        } else {
          resolve()
        }
      });
    })
  }
}

export default class CommanderPlugin extends Plugin {
  settings: CommanderPluginSettings;
  editor: CodeMirror.Editor;
  timer: NodeJS.Timeout;
  widgets: HTMLElement[];
  runningScripts: Script[];
  outputView: OutputView;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SampleSettingTab(this.app, this));

    this.registerCodeMirror((editor: CodeMirror.Editor) => {
      this.editor = editor
      this.widgets = []

      this.registerView(
        VIEW_TYPE_OUTPUT,
        (leaf: WorkspaceLeaf) =>
          (this.outputView = new OutputView(leaf, this))
      );
    })

    this.runningScripts = []

    this.initLeaf()

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
    this.registerEvent(workspace.on('active-leaf-change', () => {
      if (workspace.getLeavesOfType(VIEW_TYPE_OUTPUT).length > 0) {
        return
      }

      const leaf = workspace.getRightLeaf(true)
      if (!leaf) {
        return
      }

      leaf.setViewState({
        type: VIEW_TYPE_OUTPUT,
      });
    }));
  }

  postProcessor(el: HTMLElement) {
    let codeBlocks = Array.from(el.querySelectorAll("code"))

    if (!codeBlocks.length) {
      return;
    }

    for (const codeBlock of codeBlocks) {
      const supportedLang = Array.from(codeBlock.classList).find(cls => {
        const match = cls.match('^language-('+SUPPORTED_SCRIPT_TAGS+')$')
        return match !== null
      })

      if (!supportedLang) {
        continue
      }

      const script = new Script(this.outputView, this.settings)
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
      .setButtonText("run")
      .onClick(async () => {
        if (this.runningScripts.length > 0) {
          return
        }

        runBtn.setDisabled(true)
        runBtn.setButtonText("running..")

        this.runningScripts.push(script)

        try {
          await script.run()
          runBtn.setButtonText("runned!")
        } catch (err) {
          console.log(err);
          
          runBtn.setButtonText("failed!")
        } finally {
          this.stopAllRunningScripts()

          runBtn.setDisabled(false)
          setTimeout(() => {
            runBtn.setButtonText("run")
          }, TEXT_ANIMATION_TIME)
        }
        
      })
    
    if (this.settings.enableCopyButton) {
      const copyBtn = new ButtonComponent(widget)
        .setButtonText("copy")
        .onClick(() => {
          copyBtn.setButtonText("copied!")
          copyBtn.setDisabled(true)

          navigator.clipboard.writeText(script.content)

          copyBtn.setDisabled(false)
          setTimeout(() => {
            copyBtn.setButtonText("copy")
          }, TEXT_ANIMATION_TIME)
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
    let defaultSettings = DEFAULT_SETTINGS

    switch (os.platform()) {
      case 'darwin':
        defaultSettings = DEFAULT_MAC_SETTINGS
        break;
      case 'linux':
        defaultSettings = DEFAULT_LINUX_SETTINGS
        break;
      case 'win32':
        defaultSettings = DEFAULT_WINDOWS_SETTINGS
        break;
    }

    this.settings = Object.assign({}, defaultSettings, await this.loadData());
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

    containerEl.createEl('h1', { text: 'Commander' });
    containerEl.createEl('h2', { text: 'General Settings' });

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

    new Setting(containerEl)
      .setHeading()
      .setName('Sh')

    new Setting(containerEl)
      .setName('Executable path')
      .addText(text => text
        .setValue(this.plugin.settings.shExecutable)
        .setPlaceholder('leave empty to disable')
        .onChange(async value => {
          this.plugin.settings.shExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.shTemplate)
        .onChange(async value => {
          this.plugin.settings.shTemplate = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setHeading()
      .setName('Bash')

    new Setting(containerEl)
      .setName('Executable path')
      .addText(text => text
        .setValue(this.plugin.settings.bashExecutable)
        .setPlaceholder('leave empty to disable')
        .onChange(async value => {
          this.plugin.settings.bashExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.bashTemplate)
        .onChange(async value => {
          this.plugin.settings.bashTemplate = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setHeading()
      .setName('JavaScript')

    new Setting(containerEl)
      .setName('Executable path')
      .addText(text => text
        .setValue(this.plugin.settings.jsExecutable)
        .setPlaceholder('leave empty to disable')
        .onChange(async value => {
          this.plugin.settings.jsExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.jsTemplate)
        .onChange(async value => {
          this.plugin.settings.jsTemplate = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setHeading()
      .setName('Python')

    new Setting(containerEl)
      .setName('Executable path')
      .addText(text => text
        .setValue(this.plugin.settings.pythonExecutable)
        .setPlaceholder('leave empty to disable')
        .onChange(async value => {
          this.plugin.settings.pythonExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.pythonTemplate)
        .onChange(async value => {
          this.plugin.settings.pythonTemplate = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setHeading()
      .setName('Go')

    new Setting(containerEl)
      .setName('Executable path')
      .addText(text => text
        .setValue(this.plugin.settings.goExecutable)
        .setPlaceholder('leave empty to disable')
        .onChange(async value => {
          this.plugin.settings.goExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.goTemplate)
        .onChange(async value => {
          this.plugin.settings.goTemplate = value
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

    if (this.outputElem) {
      this.outputElem.remove()
      this.outputElem = null
    }

    const buttonContainer = document.createElement("div")
    buttonContainer.addClass('nav-header')
    buttonContainer.addClass('commander-commands')
    containerEl.appendChild(buttonContainer)

    const cleanBtn = new ButtonComponent(buttonContainer)
      .setButtonText("clear all")
      .onClick(() => {
        cleanBtn.setButtonText("done!")
        cleanBtn.setDisabled(true)

        this.clear()

        cleanBtn.setDisabled(false)
        setTimeout(() => {
          cleanBtn.setButtonText("clear all")
        }, TEXT_ANIMATION_TIME)
      })

    const copyBtn = new ButtonComponent(buttonContainer)
      .setButtonText("copy all")
      .onClick(() => {
        copyBtn.setButtonText("copied!")
        copyBtn.setDisabled(true)        

        navigator.clipboard.writeText(this.outputElem.innerHTML.replace(/<br>/g, os.EOL))

        copyBtn.setDisabled(false)
        setTimeout(() => {
          copyBtn.setButtonText("copy all")
        }, TEXT_ANIMATION_TIME)
      }) 

    this.outputElem = document.createElement("pre");
    this.outputElem.addClass('commander-output')
    containerEl.appendChild(this.outputElem)
  }

  clear() {
    this.outputElem.innerHTML = ""
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
