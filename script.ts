import * as fs from 'fs'
import * as path from 'path'
import CommanderPlugin from "main"
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { CONTENT_PLACEHOLDER, FILE_PLACEHOLDER, getLanguageSettings } from "settings"
import { Notice } from 'obsidian'

export default class Script {
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
      if (this.plugin.settings.enableOutputAutoClear && this.plugin.outputView) {
        this.plugin.outputView.clear()
      }

      const langSettings = getLanguageSettings(this.plugin.settings, this.type)
      if (!langSettings) {
        return reject('Language not supported')
      }

      const fileName = `${(new Date()).getTime()}.${this.type}`
      const filePath = path.join(this.plugin.settings.workingDirectory, fileName)

      const block = this.plugin.settings.wordsBlacklist.some(words => this.content.includes(words))
      if (block) {
        const msg = 'Script execution blocked'
        new Notice(msg)
        return reject(msg)
      }

      let fileContent = this.content
      if (langSettings.template) {
        fileContent = langSettings.template.replace(CONTENT_PLACEHOLDER, fileContent)
      }

      fs.writeFileSync(filePath, fileContent)

      const cmd = langSettings.executable.replace(FILE_PLACEHOLDER, fileName)
      let args = cmd.split(' ')
      const executable = args.shift()

      if (!executable) {
        return reject('No executable found in file placeholder')
      }

      this.command = spawn(executable, args, {
        cwd: this.plugin.settings.workingDirectory,
        timeout: this.plugin.settings.scriptTimeout * 1000, // settings is in seconds, prop in milliseconds
        env: this.plugin.settings.env,
      })
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
