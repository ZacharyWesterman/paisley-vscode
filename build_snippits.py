#!/usr/bin/env python3
import json

funcs = json.load(open('config/functions.json', 'r'))
config = json.load(open('snippets/paisley-snippets.json', 'r'))

for i in funcs:
	params = ['${' + str(k + 1) + ':' + funcs[i][k] + '}' for k in range(len(funcs[i]))]

	config[i] = {
		'scope': 'paisley',
		'prefix': [i],
		'body': [f'{i}({", ".join(params)})'],
	}

	params.pop(0)
	config['.'+i] = {
		'scope': 'paisley',
		'prefix': ['.'+i],
		'body': [f'.{i}({", ".join(params)})'],
	}

with open('snippets/paisley-snippets.json', 'w') as fp:
	json.dump(config, fp, indent = '\t')
