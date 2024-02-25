import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  Diagnostic,
  DiagnosticSeverity,
  MarkupContent,
  TextDocumentChangeEvent,
  Position,
} from "vscode-languageserver/node"

import { TextDocument } from "vscode-languageserver-textdocument"

import { DebugCommands } from "./debug"

import * as fs from 'fs'
import { spawn } from 'child_process'
import * as path from 'path'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let INSTALLED: boolean = false
let INSTALL_ATTEMPTED: boolean = false
let PROGRAM: string = ''
let LUA: string = 'lua'

function command(command: string, args: string[], opts: any, onoutput: any, input_data: string = ''): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, opts)
    process.stdout.on('data', data => {
      data.toString().split('\n').forEach((line: string) => {
        if (line) onoutput(line)
      })
    })

    // process.stderr.on('data', data => {
    //   data.toString().split('\n').forEach((line: string) => {
    //     if (line) onoutput(line)
    //   })
    // })

    // process.on('error', err => {
    //   reject(err)
    // })

    process.on('close', () => {
      resolve()
    })

    process.on('timeout', () => {
      process.kill()
      reject(new Error('Command timed out'))
    })

    process.stdin.write(input_data)
    process.stdin.end()
  })
}

function is_in_path(program_name: string): boolean {
    // Get the PATH environment variable
    const pathVar = process.env.PATH || ''

    // Split the PATH variable into individual directories
    const pathDirs = pathVar.split(path.delimiter)

    // Iterate through each directory in PATH
    for (const dir of pathDirs) {
        // Construct the full path to the program
        const fullPath = path.join(dir, program_name)

        // Check if the program file exists
        if (fs.existsSync(fullPath)) {
            return true
        }
    }

    return false
}

async function install_compiler() {
  INSTALL_ATTEMPTED = true
  const dir = __dirname + '/build'

  try { fs.statSync(dir) }
  catch (_) {
    try {
      connection.sendNotification('status', 'Downloading Paisley compiler...')
      await command('git', ['clone', 'https://github.com/ZacharyWesterman/paisley.git', dir], {}, () => {})
      try { fs.statSync(dir) }
      catch (e) {
        connection.sendNotification('error', 'Failed to clone Aglet compiler')
        connection.sendNotification('hide-status')
        return
      }
    } catch (e) {
      connection.sendNotification('error', 'Failed to install Aglet compiler')
      connection.sendNotification('hide-status')
      return
    }
  }

  connection.sendNotification('status', 'Checking for updates...')
  await command('git', ['pull'], {cwd: dir}, () => {})

  //Final check to make sure that the install went through ok.
  PROGRAM = dir + '/paisley'
  try {
    await fs.promises.access(PROGRAM, fs.constants.F_OK)
  } catch (_) {
    connection.sendNotification('error', 'Failed to fetch Paisley compiler')
    return
  }

  if (is_in_path('lua.exe')) {
    LUA = 'lua.exe'
  } else if (!is_in_path('lua')) {
    connection.sendNotification('error', 'Lua is not installed!')
    return
  }

  INSTALLED = true
  connection.sendNotification('hide-status')
}

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  }

  return result
})

documents.onDidChangeContent(async (change: TextDocumentChangeEvent<TextDocument>) => {
  if (!INSTALL_ATTEMPTED) {
    await install_compiler()
  }

  if (INSTALLED) {
    let diagnostics: Diagnostic[] = await DebugCommands.parse(change.document);
    const text = change.document.getText()

    let cmds: string[] = [PROGRAM, '--language-server', '-']
    DebugCommands.commandTypes.forEach((value: String, key: String) => {
      cmds.push(`-c${key}:${value}`)
    })

    command(LUA, cmds, {cwd: __dirname + '/build', timeout: 2000}, (line: string) => {
      const index = line.indexOf('|')
      const pos = line.substring(0, index).split(',').map((x: string) => parseInt(x))
      const message = line.substring(index + 1)

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: {
            line: pos[0],
            character: pos[1],
          },
          end: {
            line: pos[2],
            character: pos[3],
          },
        },
        message: message,
        source: 'Paisley',
      })
    }, text).then(() => {
      connection.sendDiagnostics({ uri: change.document.uri, diagnostics })
    })
  }
})

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

// Listen on the connection
connection.listen()
