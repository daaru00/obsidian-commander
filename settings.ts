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
