import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  HoverParams,
  DiagnosticSeverity,
  Position,
  TextDocumentChangeEvent,
} from "vscode-languageserver/node"

import { TextDocument } from "vscode-languageserver-textdocument"
import { DebugCommands } from "./debug"
import { spawn } from 'child_process'

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let PROGRAM: string = `${__dirname}/build/${process.platform === 'win32' ? 'paisley.exe' : 'paisley'}`

type HoverInfo = Record<string, {
  start: Position;
  end: Position;
  text: string;
}>

let hover: HoverInfo = {}

function command(command: string, args: string[], opts: any, onoutput: any, input_data: string = ''): Promise<void> {

  return new Promise((resolve, reject) => {
    const process = spawn(command, args, opts)
    process.stdout.on('data', data => {
      data.toString().split('\n').forEach((line: string) => {
        if (line) onoutput(line)
      })
    })

    process.stderr.on('data', data => {
      // connection.sendNotification('error', `${data}`)
    })

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

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
    },
  }

  return result
})

documents.onDidChangeContent(async (change: TextDocumentChangeEvent<TextDocument>) => {
  let diagnostics: Diagnostic[] = await DebugCommands.parse(change.document)
  let dead_code: number[] = []
  hover = {} //Wipe all over info as it will be re-added.

  const text = change.document.getText()

  let file_path = change.document.uri.replace('file://', '').replace('/c%3A', 'C:')

  let cmds: string[] = ['--language-server', `--stdin=${file_path}`, '-']
  DebugCommands.commandTypes.forEach((value: String, key: String) => {
    cmds.push(`-c${key}:${value}`)
  })

  command(PROGRAM, cmds, {cwd: __dirname + '/build', timeout: 2000}, (line: string) => {
    const p1 = line.indexOf(',')
    const message_type = line.substring(0, p1)
    const index = line.indexOf('|')
    const pos = line.substring(p1 + 1, index).split(',').map((x: string) => parseInt(x))
    const message = line.substring(index + 1)

    if (message_type === 'D')
    {
      dead_code.push(...pos)
      return
    }

    if (message_type === 'H')
    {
      const key = `${pos[0]}|${pos[1]}`
      if (key in hover) {
        hover[key].text += `\n${message}`
      } else {
        hover[key] ={
          start: {
            line: pos[0],
            character: pos[1],
          },
          end: {
            line: pos[2],
            character: pos[3],
          },
          text: message,
        }
      }
      return
    }

    if (!['E', 'W', 'I'].includes(message_type)) return

    diagnostics.push({
      severity: {
        'E': DiagnosticSeverity.Error,
        'W': DiagnosticSeverity.Warning,
        'H': DiagnosticSeverity.Hint,
        'I': DiagnosticSeverity.Information,
      }[message_type],
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
    connection.sendNotification('dead_code', dead_code)
  })
})


connection.onHover((params: HoverParams) => {
  for (const h of Object.values(hover)) {
    if (
      h.start.line <= params.position.line &&
      h.start.character <= params.position.character &&
      h.end.line >= params.position.line &&
      h.end.character >= params.position.character
    ) {
      return {
        contents: h.text.replace(/\\n/g, '\n').replace(/\n/g, '\n\n'),
        trustedContent: true,
      }
    }
  }
})

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

// Listen on the connection
connection.listen()
