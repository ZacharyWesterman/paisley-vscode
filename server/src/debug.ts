import {
	Diagnostic,
	DiagnosticSeverity,
} from "vscode-languageserver/node"

import { TextDocument } from "vscode-languageserver-textdocument"

export const DebugCommands = {
	commandTypes: new Map<String, String>(),
	commandBodies: new Map<String, Array<Function>>(),
	maxProblems: 100,

	parse: async function(document: TextDocument) : Promise<Diagnostic[]>
	{
		const d1 = await this.validate(document)
		const d2 = await this.register(document)

		return d1.concat(d2)
	},

	register: async function(document: TextDocument) : Promise<Diagnostic[]>
	{
		this.commandBodies = new Map<String, Array<Function>>()

		let text = document.getText()
		let pattern = /(#![ \t]*DEBUG[ \t]+)([^:,#; \t]+)\b(.*?\bEND\b)?/g
		let m: RegExpExecArray | null

		const builtInCommands = ['print', 'sleep', 'time', 'systime', 'sysdate', 'error']

		let problems = 0
		let diagnostics: Diagnostic[] = []
		while ((m = pattern.exec(text)) && problems < this.maxProblems)
		{
			if (builtInCommands.includes(m[2]))
			{
				problems++

				diagnostics.push({
					severity: DiagnosticSeverity.Warning,
					range: {
					start: document.positionAt(m.index + m[1].length),
					end: document.positionAt(m.index + m[1].length + m[2].length)
					},
					message: `"${m[2]}" is a built-in command whose behavior should not be overridden.`,
					source: 'Paisley',
			})
			}
			else if (!this.commandTypes.has(m[2]))
			{
				problems++

				diagnostics.push({
					severity: DiagnosticSeverity.Hint,
					range: {
					start: document.positionAt(m.index + m[1].length),
					end: document.positionAt(m.index + m[1].length + m[2].length)
					},
					message: `Consider specifying the return type in a #!COMMANDS comment.`,
					source: 'Paisley',
				})

				this.commandTypes.set(m[2], 'any')
			}

			if (m[3])
			{
				const text = m[3].substring(0, m[3].length - 3).replace(/#[^\n]+|^[ \t]+#+/g, '')
				const beg = document.positionAt(m.index + m[1].length + m[2].length)
				const end = document.positionAt(m.index + m[1].length + m[2].length + m[3].length - 3)

				try
				{
					const body: Function = eval(text)
					if (typeof body === 'function')
					{
						if (!this.commandBodies.has(m[2])) this.commandBodies.set(m[2], [])
						this.commandBodies.get(m[2])?.push(body)
					}
					else
					{
						diagnostics.push({
							severity: DiagnosticSeverity.Error,
							range: {
							start: beg,
							end: end,
							},
							message: `Body must be a JavaScript function, taking an array as a parameter, and returning either a string describing the error, or null for no error.`,
							source: 'JavaScript',
						})
					}
				}
				catch (e: any)
				{
					diagnostics.push({
					severity: DiagnosticSeverity.Error,
					range: {
						start: beg,
						end: end,
					},
					message: `${e.message}`,
					source: 'JavaScript',
					})
				}
			}
		}

		return diagnostics
	},

	validate: async function(document: TextDocument) : Promise<Diagnostic[]>
	{
		this.commandTypes = new Map<String, String>()

		let text = document.getText()
		let pattern = /(#![ \\t]*COMMANDS)\b.*/g
		let m: RegExpExecArray | null

		const builtInCommands = ['print', 'sleep', 'time', 'systime', 'sysdate', 'error']
		const returnTypes = ['null', 'boolean', 'number', 'string', 'array', 'any']

		let problems = 0
		let diagnostics: Diagnostic[] = []
		while ((m = pattern.exec(text)) && problems < this.maxProblems)
		{
			let line = m[0].substring(m[1].length)
			let c_pattn = /\b[^:,#; \t]+\b|[:;#]/g
			let cmd: RegExpExecArray | null

			let check_return_type = false
			let last_cmd: String | null = null

			while ((cmd = c_pattn.exec(line)) && problems < this.maxProblems)
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
					if (last_cmd !== null) this.commandTypes.set(last_cmd, cmd[0])
					last_cmd = null
					continue
				}
				problems++

				diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				range: {
					start: document.positionAt(m.index + m[1].length + cmd.index),
					end: document.positionAt(m.index + m[1].length + cmd.index + cmd[0].length)
				},
				message: `Invalid return type. Must be one of ${returnTypes.join(', ')}.`,
				source: 'Paisley',
				})
				last_cmd = null
				continue
			}
			else
			{
				if (last_cmd !== null) this.commandTypes.set(last_cmd, 'any')
			}

			last_cmd = cmd[0]

			if (!builtInCommands.includes(cmd[0])) continue
			problems++

			diagnostics.push({
				severity: DiagnosticSeverity.Warning,
				range: {
				start: document.positionAt(m.index + m[1].length + cmd.index),
				end: document.positionAt(m.index + m[1].length + cmd.index + cmd[0].length)
				},
				message: `"${cmd[0]}" is a built-in command whose behavior should not be overridden.`,
				source: 'Paisley',
			})
			}

			if (last_cmd !== null && !this.commandTypes.get(last_cmd)) this.commandTypes.set(last_cmd, 'any')
		}

		return diagnostics
	},
}
