import type { ESLint, Rule } from "eslint";

export interface PhysicalClassProblem {
  token: string;
  suggestion: string | undefined;
}

export function findPhysicalClasses(classList: string): PhysicalClassProblem[];

declare const plugin: ESLint.Plugin & {
  rules: { "no-physical-direction-classes": Rule.RuleModule };
};

export default plugin;
