const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 }, fileName: filename,
    })
    module._compile(compiled.outputText, filename)
  }
}
const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, parent, ...rest)
}
