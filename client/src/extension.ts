import * as path from "path"
import {
  window,
  StatusBarAlignment,
  languages,
  workspace,
  ExtensionContext,
  SemanticTokensLegend,
  TextDocument,
  CancellationToken,
  SemanticTokens,
  SemanticTokensBuilder,
  DecorationOptions,
  Range,
} from "vscode"

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node"

let client: LanguageClient

type RecolorInfo = {
  id: string;
  span: Range;
}

let recoloring: RecolorInfo[] = []

const tokenTypes = new Map<string, number>()
const tokenModifiers = new Map<string, number>()

const legend = (function() {
  const tokenTypesLegend = [
    'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
    'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
    'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label',
    'deadcode',
  ]
  tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index))

  const tokenModifiersLegend = [
    'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
    'modification', 'async',
  ]
  tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index))

  return new SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend)
})()

// Special text decorators
const deadCodeDecorator = window.createTextEditorDecorationType({
  opacity: "50%",
});


export function activate(context: ExtensionContext) {
  //For dead code and semantic re-coloring
  context.subscriptions.push(languages.registerDocumentSemanticTokensProvider({ language: 'paisley' }, new DocumentSemanticTokensProvider(), legend))

  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left)

  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  )

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  }

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for all documents by default
    documentSelector: [{ scheme: "file", language: "paisley" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
    markdown: {
      isTrusted: true,
      supportHtml: true,
    }
  }

  // Create the language client and start the client.
  client = new LanguageClient(
    "paisley",
    "Paisley Language Server",
    serverOptions,
    clientOptions
  )

  client.onNotification('status', params => {
    statusBarItem.text = params
    statusBarItem.show()
  })

  client.onNotification('hide-status', () => {
    statusBarItem.hide()
  })

  client.onNotification('error', params => {
    window.showErrorMessage(params)
  })

  client.onNotification('recoloring', params => {
    recoloring = params
  })

  // Start the client. This will also launch the server
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  return client.stop()
}

class DocumentSemanticTokensProvider {
  async provideDocumentSemanticTokens(document: TextDocument, token: CancellationToken): Promise<SemanticTokens> {
    const builder = new SemanticTokensBuilder()

    const deadCode: DecorationOptions[] = []

    for (const recolor of recoloring)
    {
      switch (recolor.id) {
        case 'dead_code':
          deadCode.push({range: recolor.span});
          break;
        case 'constant':
          builder.push(
            recolor.span.start.line,
            recolor.span.start.character,
            recolor.span.end.character - recolor.span.start.character,
            this.encodeTokenType('variable'),
            this.encodeTokenModifiers(['readonly']),
          )
          break;
        case 'func_call':
          builder.push(
            recolor.span.start.line,
            recolor.span.start.character,
            recolor.span.end.character - recolor.span.start.character,
            this.encodeTokenType('function'),
            this.encodeTokenModifiers(['readonly']),
          )
          break;
      }
    }

    window.activeTextEditor.setDecorations(deadCodeDecorator, deadCode)
    return builder.build()
  }

	private encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2
		}
		return 0
	}

	private encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i]
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!)
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2)
			}
		}
		return result
	}
}
