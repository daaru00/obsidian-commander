import { App, ButtonComponent, ItemView, MarkdownPostProcessorContext, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import "./lib/icons"
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawn } from 'child_process'

interface CommanderPluginSettings {
  enableCopyButton: boolean;
  outputAutoClear: boolean;
  outputMaxLength: number;
  outputAutoCopy: boolean;
  tmpDir: string;
  bashExecutable: string;
  shExecutable: string;
  nodejsExecutable: string;
  pythonExecutable: string;
  goExecutable: string;
}

const DEFAULT_SETTINGS: CommanderPluginSettings = {
  enableCopyButton: true,
  outputAutoClear: false,
  outputMaxLength: 1000,
  outputAutoCopy: false,
  tmpDir: os.tmpdir(),
  bashExecutable: '',
  shExecutable: '',
  nodejsExecutable: '',
  pythonExecutable: '',
  goExecutable: '',
}

const DEFAULT_LINUX_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
  bashExecutable: "/bin/bash",
  shExecutable: "/bin/sh",
  nodejsExecutable: "/usr/bin/nodejs",
  pythonExecutable: "/usr/bin/python",
  goExecutable: "/usr/local/go",
}
const DEFAULT_MAC_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
}
const DEFAULT_WINDOWS_SETTINGS: CommanderPluginSettings = {
  ...DEFAULT_SETTINGS,
}

const VIEW_TYPE_OUTPUT = 'commander-output'
const SUPPORTED_SCRIPT_TAGS = 'bash|sh|js|javascript|python|go'

class Script {
  outputView: OutputView;
  fromLine: number;
  toLine: number;
  editor: CodeMirror.Editor;
  content: string;
  type: string;
  settings: CommanderPluginSettings;

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

  setFromLine(line: number) {
    this.fromLine = line
  }

  setToLine(line: number) {
    this.toLine = line
  }

  run() {
    if (this.settings.outputAutoClear) {
      this.outputView.clear()
    }

    const id = (new Date()).getTime()
    const filePath = path.join(os.tmpdir(), `${id}.${this.type}`)
    fs.writeFileSync(filePath, this.content)

    let command = null
    
    switch (this.type) {
      case 'sh':
        command = spawn(this.settings.shExecutable, [filePath]);
        break;
      case 'bash':
        command = spawn(this.settings.bashExecutable, [filePath]);
        break;
      case 'js':
      case 'javascript':
        command = spawn(this.settings.nodejsExecutable, [filePath]);
        break;
      case 'python':
        command = spawn(this.settings.pythonExecutable, [filePath]);
        break;
      case 'go':
        command = spawn(this.settings.goExecutable, ['run', filePath]);
        break;
      default:
        fs.unlinkSync(filePath)
        return
    }

    command.stdout.on('data', (data) => {
      this.outputView.print(data)
    });

    command.stderr.on('data', (data) => {
      this.outputView.print(data)
    });

    command.on('error', (error) => {
      this.outputView.print(error.message)
    });

    command.on('exit', (code) => {
      if (code !== 0) {
        this.outputView.print(`exit code ${code}\n`)
      }
      fs.unlinkSync(filePath)
    });
  }
}

export default class CommanderPlugin extends Plugin {
  settings: CommanderPluginSettings;
  editor: CodeMirror.Editor;
  timer: NodeJS.Timeout;
  widgets: HTMLElement[];
  scripts: Script[];
  statusBarItem: HTMLElement;
  outputView: OutputView;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new SampleSettingTab(this.app, this));

    this.statusBarItem = this.addStatusBarItem()

    this.registerCodeMirror((editor: CodeMirror.Editor) => {
      this.editor = editor
      this.widgets = []

      this.registerView(
        VIEW_TYPE_OUTPUT,
        (leaf: WorkspaceLeaf) =>
          (this.outputView = new OutputView(leaf, this))
      );
    })

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

  findScripts(content: string) {
    const scripts = []

    let currentScript = null
    const lines = content.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]

      const firstLineMatch = line.match('^```('+SUPPORTED_SCRIPT_TAGS+')$')
      if (firstLineMatch !== null) {
        currentScript = new Script(this.outputView, this.settings)
        currentScript.setFromLine(index)
        currentScript.setType(firstLineMatch[1])
        continue
      }

      if (currentScript !== null && line === '```') {
        currentScript.setToLine(index)
        scripts.push(currentScript)
        currentScript = null
        continue
      }

      if (currentScript !== null) {
        currentScript.addContent(line)
        continue
      }
    }

    this.scripts = scripts
    return this.scripts
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

      const widget = this.createWidget(script)
      widget.addClass('rendered')

      codeBlock.parentElement.addClass('commander-block-relative')
      codeBlock.parentElement.appendChild(widget)
    }
  }

  createWidget(script: Script): HTMLElement {
    const widget = document.createElement("div");
    widget.addClass('commander-execute-container')

    const runBtn = new ButtonComponent(widget)
      .setButtonText("run")
      .onClick(async () => {
        runBtn.setDisabled(true)
        runBtn.setButtonText("running..")

        try {
          await script.run()
          runBtn.setButtonText("runned!")
        } catch (err) {
          runBtn.setButtonText("failed!")
        } finally {
          setTimeout(() => {
            runBtn.setButtonText("run")
            runBtn.setDisabled(false)
          }, 1000)
        }
        
      })
    
    if (this.settings.enableCopyButton) {
      const copyBtn = new ButtonComponent(widget)
        .setButtonText("copy")
        .onClick(() => {
          copyBtn.setButtonText("copied!")
          copyBtn.setDisabled(true)

          navigator.clipboard.writeText(script.content)

          setTimeout(() => {
            copyBtn.setDisabled(false)
            copyBtn.setButtonText("copy")
          }, 1000)
        }) 
    }

    return widget
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
      .setName('Output automatic copy')
      .setDesc('Copy command output into note after execution')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.outputAutoCopy)
        .onChange(async value => {
          this.plugin.settings.outputAutoCopy = value
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

    containerEl.createEl('h2', { text: 'Executable Paths' });

    new Setting(containerEl)
      .setName('sh')
      .addText(text => text
        .setValue(this.plugin.settings.shExecutable)
        .onChange(async value => {
          this.plugin.settings.shExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('bash')
      .addText(text => text
        .setValue(this.plugin.settings.bashExecutable)
        .onChange(async value => {
          this.plugin.settings.bashExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('js / javascript')
      .addText(text => text
        .setValue(this.plugin.settings.nodejsExecutable)
        .onChange(async value => {
          this.plugin.settings.nodejsExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('python')
      .addText(text => text
        .setValue(this.plugin.settings.pythonExecutable)
        .onChange(async value => {
          this.plugin.settings.pythonExecutable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('go')
      .addText(text => text
        .setValue(this.plugin.settings.goExecutable)
        .onChange(async value => {
          this.plugin.settings.goExecutable = value
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

    new ButtonComponent(buttonContainer)
      .setButtonText("clear all")
      .onClick(() => {
        this.clear()
      })

    new ButtonComponent(buttonContainer)
      .setButtonText("copy to note")
      .onClick(() => {
        this.copyToNote()
      })


    this.outputElem = document.createElement("pre");
    this.outputElem.addClass('commander-output')
    containerEl.appendChild(this.outputElem)
  }

  clear() {
    this.outputElem.innerHTML = ""
  }
  
  copyToNote() {
    let content = this.outputElem.innerHTML
    content = content.split('<br>').join('\n')
    this.plugin.editor.replaceRange(content, this.plugin.editor.getCursor());
  }

  print(msg: string) {
    msg = `${msg}`.replace(/\n/g, '<br>')
    this.outputElem.innerHTML += msg

    const overLimit = this.outputElem.innerHTML.length - this.plugin.settings.outputMaxLength
    if (overLimit > 0) {
      this.outputElem.innerHTML = this.outputElem.innerHTML.slice(overLimit)
    }
  }
}
