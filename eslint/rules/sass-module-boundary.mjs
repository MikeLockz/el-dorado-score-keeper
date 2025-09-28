import path from 'node:path';

function isSassModule(source) {
  return typeof source === 'string' && source.endsWith('.module.scss');
}

function toAbsolute(filename, importerDir, importPath) {
  if (importPath.startsWith('.')) {
    return path.resolve(importerDir, importPath);
  }
  return null;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow importing Sass modules from outside the component directory',
      recommended: false,
    },
    schema: [],
    messages: {
      relative: 'Sass modules must be imported using a relative path scoped to the component directory.',
      sibling: 'Sass modules must live in the same folder as their component. Move the stylesheet next to the importer or create a local alias.',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (!filename || filename === '<text>') {
      return {};
    }

    const importerDir = path.dirname(path.resolve(filename));

    function report(node, messageId) {
      context.report({ node, messageId });
    }

    function validateImport(node) {
      const importPath = node.source?.value;
      if (!isSassModule(importPath)) {
        return;
      }

      if (typeof importPath !== 'string') {
        return;
      }

      if (!importPath.startsWith('.')) {
        report(node.source, 'relative');
        return;
      }

      const absolutePath = toAbsolute(filename, importerDir, importPath);
      if (!absolutePath) {
        report(node.source, 'relative');
        return;
      }

      const stylesheetDir = path.dirname(absolutePath);
      if (path.normalize(stylesheetDir) !== path.normalize(importerDir)) {
        report(node.source, 'sibling');
      }
    }

    return {
      ImportDeclaration(node) {
        validateImport(node);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal' &&
          isSassModule(node.arguments[0].value)
        ) {
          const fakeNode = { source: node.arguments[0] };
          validateImport(fakeNode);
        }
      },
    };
  },
};

export default {
  rules: {
    'no-external-import': rule,
  },
};
