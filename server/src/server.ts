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
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };

  return result;
});

documents.onDidChangeContent((change) => {
  validateDebugCommands(change.document)
});

const maxProblems = 500
let commandTypes = new Map<String, String>() //Keep track of command return types.

async function validateDebugCommands(document: TextDocument) : Promise<void>
{
  commandTypes = new Map<String, String>()

  let text = document.getText()
  let pattern = /#!COMMANDS\b.*/g
  let m: RegExpExecArray | null

  const builtInCommands = ['print', 'sleep', 'time', 'systime', 'sysdate', 'error']
  const returnTypes = ['null', 'boolean', 'number', 'string', 'array', 'any']

  let problems = 0
  let diagnostics: Diagnostic[] = []
  while ((m = pattern.exec(text)) && problems < maxProblems)
  {
    let line = m[0].substring(10)
    let c_pattn = /\b[^:,#; \t]+\b|[:;#]/g
    let cmd: RegExpExecArray | null

    let check_return_type = false
    let last_cmd: String | null = null

    while ((cmd = c_pattn.exec(line)) && problems < maxProblems)
    {
      if (cmd[0] === ';' || cmd[0] === '#') break

      if (cmd[0] === ':')
      {
        check_return_type = true
        continue
      }

      if (check_return_type)
      {
        check_return_type = false
        if (returnTypes.includes(cmd[0]))
        {
          if (last_cmd !== null) commandTypes.set(last_cmd, cmd[0])
          continue
        }
        problems++

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: document.positionAt(m.index + 10 + cmd.index),
            end: document.positionAt(m.index + 10 + cmd.index + cmd[0].length)
          },
          message: `Invalid return type. Must be one of ${returnTypes.join(', ')}.`,
          source: 'Paisley'
        })
        continue
      }

      last_cmd = cmd[0]

      if (!builtInCommands.includes(cmd[0])) continue
      problems++

      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: document.positionAt(m.index + 10 + cmd.index),
          end: document.positionAt(m.index + 10 + cmd.index + cmd[0].length)
        },
        message: `"${cmd[0]}" is a built-in command whose behavior should not be overridden.`,
        source: 'Paisley'
      })
    }
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics})
}



// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
