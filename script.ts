import * as fs from 'fs'
import * as path from 'path'
import CommanderPlugin from "main"
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { CONTENT_PLACEHOLDER, FILE_PLACEHOLDER, getLanguageSettings } from "settings"

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
