import CommanderPlugin from 'main'
import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian'
import * as os from 'os'

export interface PluginLanguageSettings {
  executable: string;
  template: string;
  preArgs?: string[];
  postArgs?: string[];
}

export interface PluginSettings {
  enableStatusBarItem: boolean;
  enableCopyButton: boolean;
  enableOutputAutoClear: boolean;
  outputMaxLines: number;
  workingDirectory: string;
  scriptTimeout: number;
  wordsBlacklist: string[];
  env: { [key: string]: string };
  languages: { [lang: string]: PluginLanguageSettings }
}

export const CONTENT_PLACEHOLDER = '%CONTENT%'
export const FILE_PLACEHOLDER = '%FILE%'

export const DEFAULT_SETTINGS: PluginSettings = {
  enableStatusBarItem: true,
  enableCopyButton: true,
  enableOutputAutoClear: false,
  outputMaxLines: 50,
  workingDirectory: os.tmpdir(),
  scriptTimeout: 300,
  wordsBlacklist: ['sudo'],
  env: {},
  languages: {
    'sh': {
      executable: `sh ${FILE_PLACEHOLDER}`,
      template: `#!/bin/sh${os.EOL}${os.EOL}set -e${os.EOL}${os.EOL}${CONTENT_PLACEHOLDER}`,
    },
    'bash': {
      executable: `bash ${FILE_PLACEHOLDER}`,
      template: `#!/bin/bash${os.EOL}${os.EOL}set -e${os.EOL}${os.EOL}${CONTENT_PLACEHOLDER}`,
    },
    'js|javascript': {
      executable: `node ${FILE_PLACEHOLDER}`,
      template: `(async () => {${os.EOL}  ${CONTENT_PLACEHOLDER}${os.EOL}})()`,
    },
    'python': {
      executable: `python ${FILE_PLACEHOLDER}`,
      template: CONTENT_PLACEHOLDER,
    },
    'go': {
      executable: `go run ${FILE_PLACEHOLDER}`,
      template: `package main${os.EOL}${os.EOL}import ("fmt")${os.EOL}${os.EOL}func main() {${os.EOL}  ${CONTENT_PLACEHOLDER}${os.EOL}}`,
    },
    'php': {
      executable: `php ${FILE_PLACEHOLDER}`,
      template: `<?php${os.EOL}${os.EOL}${CONTENT_PLACEHOLDER}`
    }
  }
}

export function getLanguageSettings(settings: PluginSettings, type: string): PluginLanguageSettings | null {
  for (const key in settings.languages) {
    const match = type.match('^' + key + '$')
    if (match !== null) {
      return settings.languages[key];
    }
  }
  return null
}

export function getAllSupportedLanguages(settings: PluginSettings): string {
  return Object.keys(settings.languages).join('|')
}

const OUTPUT_MIN_LINES = 5
const OUTPUT_MAX_LINES = 5000

export default class SettingTab extends PluginSettingTab {
  plugin: CommanderPlugin;

  constructor(app: App, plugin: CommanderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Enable status bar item')
      .setDesc('Add a status bar item with running script count')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableStatusBarItem)
        .onChange(async value => {
          this.plugin.settings.enableStatusBarItem = value
          await this.plugin.saveSettings()
        })
      )

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
      .setName('Enable automatic output clean')
      .setDesc('Clear the output panel content before new executions')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableOutputAutoClear)
        .onChange(async value => {
          this.plugin.settings.enableOutputAutoClear = value
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
      .setName('Working directory')
      .setDesc('The path where code scripts are executed')
      .addText(text => text
        .setValue(this.plugin.settings.workingDirectory)
        .onChange(async value => {
          this.plugin.settings.workingDirectory = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName('Script timeout')
      .setDesc('Execution timeout in seconds, 0 to disable')
      .addDropdown(dropdown => dropdown
        .addOptions({
          '0': "disabled",
          '60': "1 minute",
          '300': "5 minutes",
          '600': "10 minutes",
          '1800': "30 minutes",
        })
        .setValue(this.plugin.settings.scriptTimeout.toString())
        .onChange(async (value) => {
          this.plugin.settings.scriptTimeout = parseInt(value);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Words blacklist')
      .setDesc(`Block code execution that match these words (one per line)`)
      .addTextArea(textArea => textArea
        .setValue(this.plugin.settings.wordsBlacklist.join(os.EOL))
        .onChange(async value => {
          this.plugin.settings.wordsBlacklist = value.split(os.EOL)
          await this.plugin.saveSettings()
        })
      )

    containerEl.createEl('h3', {text: 'Environment variables', cls: ['commander-settings-title']})

    const envEl = window.createDiv()
    for (const key in this.plugin.settings.env) {
      this.addEnvVariableSettings(envEl, key)
    }
    containerEl.appendChild(envEl)

    let envTextComponent: TextComponent
    new Setting(containerEl)
      .setName("Add env variable")
      .setDesc("The key must correspond to code block type")
      .addText(text => {
        envTextComponent = text
        text.setPlaceholder("EXAMPLE_ENV_VAR")
      })
      .addExtraButton(btn => btn
        .setIcon('add')
        .setTooltip("Add a env variable")
        .onClick(async () => {
          const key = envTextComponent.getValue()
          if (key.trim().length === 0) {
            return
          }

          this.plugin.settings.env[key] = ''
          await this.plugin.saveSettings()

          this.addEnvVariableSettings(envEl, envTextComponent.getValue())
          envTextComponent.setValue('')
        })
      )

    containerEl.createEl('h3', {text: 'Supported languages', cls: ['commander-settings-title']})

    const languagesEl = window.createDiv()
    for (const key in this.plugin.settings.languages) {
      this.addLanguageSettings(languagesEl, key)
    }
    containerEl.appendChild(languagesEl)

    let langTextComponent: TextComponent
    new Setting(containerEl)
      .setName("Add new language support")
      .setDesc("The key must correspond to code block type")
      .addText(text => {
        langTextComponent = text
        text.setPlaceholder("js|javascript")
      })
      .addExtraButton(btn => btn
        .setIcon('add')
        .setTooltip("Add a new language")
        .onClick(async () => {
          const key = langTextComponent.getValue()
          if (key.trim().length === 0) {
            return
          }

          this.plugin.settings.languages[key] = {
            executable: key.split('|').shift() + ' ' + FILE_PLACEHOLDER,
            template: CONTENT_PLACEHOLDER
          }
          await this.plugin.saveSettings()

          this.addLanguageSettings(languagesEl, langTextComponent.getValue())
          langTextComponent.setValue('')
        })
      )
  }

  addEnvVariableSettings(containerEl: HTMLElement, key: string) {
    const settingsContainer = containerEl.createEl('div', { cls: ['commander-env-settings'] })

    new Setting(settingsContainer)
      .setName(key)
      .addText(text => text
        .setValue(this.plugin.settings.env[key])
        .onChange(async value => {
          this.plugin.settings.env[key] = value
          await this.plugin.saveSettings()
        })
      )
      .addExtraButton(btn => btn
        .setIcon('trash')
        .setTooltip('Delete env variable')
        .onClick(async () => {
          settingsContainer.remove()
          delete this.plugin.settings.env[key]
          await this.plugin.saveSettings()
        })
      )
  }

  addLanguageSettings(containerEl: HTMLElement, key: string) {
    const settingsContainer = containerEl.createEl('div', { cls: ['commander-lang-settings'] })

    const settingsHeader = settingsContainer.createEl('div', { cls: ['commander-lang-settings-header'] })
    settingsHeader.createEl('h3', { text: key.replace(/\|/g, ' ') })

    new Setting(settingsHeader)
      .addButton(btn => btn
        .setIcon('trash')
        .setClass('commander-lang-delete-btn')
        .setTooltip('Delete language')
        .onClick(async () => {
          settingsContainer.remove()
          delete this.plugin.settings.languages[key]
          await this.plugin.saveSettings()
        })
      )

    new Setting(settingsContainer)
      .setName('Executable')
      .addText(text => text
        .setPlaceholder('exec '+FILE_PLACEHOLDER)
        .setValue(this.plugin.settings.languages[key].executable)
        .onChange(async value => {
          this.plugin.settings.languages[key].executable = value
          await this.plugin.saveSettings()
        })
      )

    new Setting(settingsContainer)
      .setName('Template')
      .addTextArea(textArea => textArea
        .setPlaceholder(CONTENT_PLACEHOLDER)
        .setValue(this.plugin.settings.languages[key].template)
        .onChange(async value => {
          this.plugin.settings.languages[key].template = value
          await this.plugin.saveSettings()
        })
      )
  }
}
