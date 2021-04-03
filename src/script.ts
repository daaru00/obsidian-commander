import * as fs from 'fs'
import * as path from 'path'
import CommanderPlugin from "./main"
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { CONTENT_PLACEHOLDER, FILE_PLACEHOLDER, getLanguageSettings } from "./settings"
import { Notice } from 'obsidian'

const ARG_REGEX_QUOTED = /^"[^"]*"$/;
const ARG_REGEX = /^([^"]|[^"].*?[^"])$/;

export default class Script {
	plugin: CommanderPlugin;
	content: string;
	type: string;
	command: ChildProcessWithoutNullStreams;

	constructor(plugin: CommanderPlugin) {
		this.plugin = plugin
	}

	setType(type: string): void {
		this.type = type
	}

	addContent(content: string): void {
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

      // Check blacklisted words

			const block = this.plugin.settings.wordsBlacklist.some(words => this.content.includes(words))
			if (block) {
				const msg = 'Script execution blocked'
				new Notice(msg)
				return reject(msg)
			}

      // Write code script file on disk

      const fileName = `${(new Date()).getTime()}.${this.type}`
			const filePath = path.join(this.plugin.settings.workingDirectory, fileName)

			let fileContent = this.content
			if (langSettings.template) {
				fileContent = langSettings.template.replace(CONTENT_PLACEHOLDER, fileContent)
			}

			fs.writeFileSync(filePath, fileContent)

      // Prepare command and arguments

			const cmd = langSettings.executable.replace(FILE_PLACEHOLDER, fileName)

			const args: string[] = []
			let argPart = ""
			cmd.split(" ").forEach((arg: string) => {
				if ((ARG_REGEX_QUOTED.test(arg) || ARG_REGEX.test(arg)) && !argPart) {
					args.push(arg)
				} else {
					argPart = argPart ? argPart + " " + arg : arg
					if (argPart.endsWith('')) {
						args.push(argPart)
						argPart = ''
					}
				}
			})

			const executable = args.shift()
			if (!executable) {
				return reject('No executable found in file placeholder')
			}

      // Execute command

			this.command = spawn(executable, args, {
				cwd: this.plugin.settings.workingDirectory,
				timeout: this.plugin.settings.scriptTimeout * 1000, // settings is in seconds, prop in milliseconds
				env: {
          ...process.env, // pass current environment variables (PATH, GOPATH..)
          ...this.plugin.settings.env
        },
			})

      // Attach to process events

			this.command.stdout.on('data', (data) => {
				this.print(data.toString())
			});

			this.command.stderr.on('data', (data) => {
				this.print(data.toString())
			});

			this.command.on('error', (error) => {
				this.print(error.message)

        // Check if command didn't start
        // (for example due an ENOENT error)
        if (!this.command.pid) {
          reject(error.message)
        }
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

	print(msg: string): void {
		if (this.plugin.outputView) {
			this.plugin.outputView.print(msg)
		}
	}
}
