/**
 * Flags physical (left/right) Tailwind utilities in class lists. The store renders in both
 * RTL and LTR, so layouts must use logical utilities (ms/me, ps/pe, inset-s/inset-e, text-start,
 * border-s/e, rounded-s/e…). A physical utility is allowed only behind an `rtl:` or `ltr:`
 * variant, which marks a deliberate, direction-specific exception.
 *
 * Checked: `className` / `class` JSX attributes and the arguments of cn/cva/clsx/cx/twMerge.
 */

const PHYSICAL_UTILITY =
  /^(?:(?:scroll-)?[mp][lr]|left|right|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br))(?:-|$)|^text-(?:left|right)$|^(?:float|clear)-(?:left|right)$/;

const LOGICAL_HINT = {
  ml: "ms",
  mr: "me",
  pl: "ps",
  pr: "pe",
  "scroll-ml": "scroll-ms",
  "scroll-mr": "scroll-me",
  "scroll-pl": "scroll-ps",
  "scroll-pr": "scroll-pe",
  left: "inset-s",
  right: "inset-e",
  "border-l": "border-s",
  "border-r": "border-e",
  "rounded-l": "rounded-s",
  "rounded-r": "rounded-e",
  "rounded-tl": "rounded-ss",
  "rounded-tr": "rounded-se",
  "rounded-bl": "rounded-es",
  "rounded-br": "rounded-ee",
  "text-left": "text-start",
  "text-right": "text-end",
  "float-left": "float-start",
  "float-right": "float-end",
  "clear-left": "clear-start",
  "clear-right": "clear-end",
};

const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "cx", "twMerge"]);
const DIRECTION_VARIANTS = new Set(["rtl", "ltr"]);

/** Splits `md:hover:-ml-2` into variants and utility, ignoring `:` inside brackets. */
function splitVariants(token) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    else if (char === ":" && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  return { variants: parts, utility: token.slice(start) };
}

export function findPhysicalClasses(classList) {
  const problems = [];
  for (const token of classList.split(/\s+/)) {
    if (!token) continue;
    const { variants, utility } = splitVariants(token);
    if (variants.some((variant) => DIRECTION_VARIANTS.has(variant))) continue;

    // Strip the important modifier and the negative-value prefix (`!-ml-2`).
    const bare = utility.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
    if (!PHYSICAL_UTILITY.test(bare)) continue;

    const key = Object.keys(LOGICAL_HINT)
      .sort((a, b) => b.length - a.length)
      .find((prefix) => bare === prefix || bare.startsWith(`${prefix}-`));
    problems.push({ token, suggestion: key ? LOGICAL_HINT[key] : undefined });
  }
  return problems;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow physical left/right Tailwind utilities; use logical ones for RTL.",
    },
    messages: {
      physical:
        "'{{token}}' is a physical direction class and breaks RTL/LTR mirroring. Use the logical '{{suggestion}}' utility, or prefix with rtl:/ltr: for a deliberate exception.",
    },
    schema: [],
  },
  create(context) {
    function reportString(node, value) {
      for (const { token, suggestion } of findPhysicalClasses(value)) {
        context.report({
          node,
          messageId: "physical",
          data: { token, suggestion: suggestion ?? "inset-s/inset-e" },
        });
      }
    }

    function visit(node) {
      if (!node) return;
      switch (node.type) {
        case "Literal":
          if (typeof node.value === "string") reportString(node, node.value);
          break;
        case "TemplateLiteral":
          for (const quasi of node.quasis) reportString(quasi, quasi.value.cooked ?? "");
          node.expressions.forEach(visit);
          break;
        case "JSXExpressionContainer":
          visit(node.expression);
          break;
        case "ConditionalExpression":
          visit(node.consequent);
          visit(node.alternate);
          break;
        case "LogicalExpression":
          visit(node.left);
          visit(node.right);
          break;
        case "ArrayExpression":
          node.elements.forEach(visit);
          break;
        case "ObjectExpression":
          for (const property of node.properties) {
            if (property.type !== "Property") continue;
            // clsx-style `{ "ml-2": condition }` keys are class names too.
            if (property.key.type === "Literal") visit(property.key);
            visit(property.value);
          }
          break;
        // Class-function calls are reported by the CallExpression visitor below, wherever
        // they appear, so they are not descended into here (avoids duplicate reports).
        default:
          break;
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && /^(className|class)$/.test(node.name.name)) {
          visit(node.value);
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && CLASS_FUNCTIONS.has(node.callee.name)) {
          node.arguments.forEach(visit);
        }
      },
    };
  },
};

const plugin = {
  meta: { name: "local" },
  rules: { "no-physical-direction-classes": rule },
};

export default plugin;
