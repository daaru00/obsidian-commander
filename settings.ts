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
  enableCopyButton: boolean;
  outputAutoClear: boolean;
  outputMaxLines: number;
  tmpDir: string;
  languages: {[lang: string]: PluginLanguageSettings}
}

export const CONTENT_PLACEHOLDER = '%CONTENT%'
export const FILE_PLACEHOLDER = '%FILE%'

export const DEFAULT_SETTINGS: PluginSettings = {
  enableCopyButton: true,
  outputAutoClear: false,
  outputMaxLines: 50,
  tmpDir: os.tmpdir(),
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
      .setName("Add new language support")
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
          if (key.trim().length === 0) {
            return
          }

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

    const languagesSettingsHeader = languagesSettingsContainer.createEl('div', { cls: ['commander-lang-settings-header'] })
    languagesSettingsHeader.createEl('h3', { text: key.replace(/\|/g, ' ') })
    
    
    new Setting(languagesSettingsHeader)
      .addButton(btn => btn
        .setIcon('trash')
        .setClass('commander-lang-delete-btn')
        .setTooltip('Delete language')
        .onClick(async () => {
          languagesSettingsContainer.remove()
          delete this.plugin.settings.languages[key]
          await this.plugin.saveSettings()
        })
      )

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
  }
}
