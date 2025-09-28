const STANDALONE_UTILITY_TOKENS = new Set([
  'flex',
  'grid',
  'inline-flex',
  'inline-grid',
  'block',
  'inline-block',
  'hidden',
]);

const BRACKET_TOKEN_PATTERN = /\[[^\]]+\]/;
const HYPHENATED_TOKEN_PATTERN = /^(?:-?)(?:[a-z][\w-]*:)*[a-z][\w-]*-[\w:./%\[\]-]+$/i;

function tokenize(value) {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isTailwindToken(token) {
  if (STANDALONE_UTILITY_TOKENS.has(token)) {
    return true;
  }

  if (BRACKET_TOKEN_PATTERN.test(token)) {
    return true;
  }

  if (HYPHENATED_TOKEN_PATTERN.test(token)) {
    return true;
  }

  return false;
}

function literalValue(node) {
  if (!node) {
    return [];
  }

  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [node.value] : [];
    case 'TemplateLiteral':
      if (node.expressions.length === 0) {
        return [node.quasis.map((part) => part.value.cooked ?? '').join('')];
      }
      return [];
    case 'BinaryExpression':
      if (node.operator === '+') {
        return [...literalValue(node.left), ...literalValue(node.right)];
      }
      return [];
    case 'ConditionalExpression':
      return [...literalValue(node.consequent), ...literalValue(node.alternate)];
    case 'LogicalExpression':
      return [...literalValue(node.left), ...literalValue(node.right)];
    case 'ArrayExpression':
      return node.elements.flatMap((element) =>
        element && element.type !== 'SpreadElement' ? literalValue(element) : [],
      );
    case 'CallExpression':
      return node.arguments.flatMap((argument) =>
        argument.type === 'SpreadElement' ? [] : literalValue(argument),
      );
    case 'ObjectExpression':
      return node.properties.flatMap((prop) => {
        if (prop.type !== 'Property' || prop.computed) {
          return [];
        }

        if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
          return [prop.key.value];
        }

        if (prop.key.type === 'TemplateLiteral' && prop.key.expressions.length === 0) {
          return [prop.key.quasis.map((part) => part.value.cooked ?? '').join('')];
        }

        return [];
      });
    default:
      return [];
  }
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Tailwind utility class usage in JSX className values',
      recommended: false,
    },
    schema: [],
    messages: {
      tailwindToken: 'Tailwind utility "{{token}}" is not allowed. Use scoped Sass modules or shared mixins instead.',
    },
  },
  create(context) {
    function report(node, token) {
      context.report({ node, messageId: 'tailwindToken', data: { token } });
    }

    function checkValue(node, value) {
      for (const token of tokenize(value)) {
        if (isTailwindToken(token)) {
          report(node, token);
          break;
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className' || !node.value) {
          return;
        }

        if (node.value.type === 'Literal') {
          if (typeof node.value.value === 'string') {
            checkValue(node.value, node.value.value);
          }
          return;
        }

        if (node.value.type === 'JSXExpressionContainer') {
          const strings = literalValue(node.value.expression);
          for (const text of strings) {
            checkValue(node.value.expression, text);
          }
        }
      },
    };
  },
};

export default {
  rules: {
    'no-tailwind-classnames': rule,
  },
};
