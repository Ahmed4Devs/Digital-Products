import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import plugin, {
  findPhysicalClasses,
} from "../../../eslint-rules/no-physical-direction-classes.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const rule = plugin.rules["no-physical-direction-classes"];

describe("findPhysicalClasses", () => {
  it("accepts logical utilities and look-alikes", () => {
    const ok =
      "ms-2 me-2 ps-4 pe-4 inset-s-0 inset-e-0 start-0 text-start text-end border-s border-e rounded-s rounded-ee " +
      "mx-2 px-4 border-lime-500 rounded-lg place-items-center pt-2 mb-4 top-0";
    expect(findPhysicalClasses(ok)).toEqual([]);
  });

  it("flags physical utilities with variants, negatives and important modifiers", () => {
    expect(
      findPhysicalClasses("ml-2 md:pr-4 -mr-1 !left-0 hover:text-right rounded-tl-md").map((p) => [
        p.token,
        p.suggestion,
      ]),
    ).toEqual([
      ["ml-2", "ms"],
      ["md:pr-4", "pe"],
      ["-mr-1", "me"],
      ["!left-0", "inset-s"],
      ["hover:text-right", "text-end"],
      ["rounded-tl-md", "rounded-ss"],
    ]);
  });

  it("allows deliberate rtl:/ltr: exceptions", () => {
    expect(findPhysicalClasses("rtl:mr-2 ltr:ml-2 md:rtl:left-0")).toEqual([]);
  });

  it("ignores colons inside arbitrary values", () => {
    expect(findPhysicalClasses("[&_svg]:ms-2 data-[side=left]:slide-in-from-right-2")).toEqual([]);
    expect(findPhysicalClasses("[&_svg]:ml-2").map((p) => p.token)).toEqual(["[&_svg]:ml-2"]);
  });
});

tester.run("no-physical-direction-classes", rule, {
  valid: [
    { code: `const a = <div className="ms-2 pe-4 text-start" />;` },
    { code: `const a = <div className={cond ? "inset-s-0" : "inset-e-0"} />;` },
    { code: `const a = cn("rtl:ml-2", { "me-1": on });` },
    { code: `const a = <div title="left right" />;` },
    { code: `const a = other("ml-2");` },
  ],
  invalid: [
    {
      code: `const a = <div className="ml-2" />;`,
      errors: [{ messageId: "physical" }],
    },
    {
      code: "const a = <div className={`p-2 ${x} text-left`} />;",
      errors: [{ messageId: "physical" }],
    },
    {
      code: `const a = <div className={cn("pr-2", cond && "left-0", { "border-l": on })} />;`,
      errors: [{ messageId: "physical" }, { messageId: "physical" }, { messageId: "physical" }],
    },
    {
      code: `const v = cva("base", { variants: { size: { sm: "pl-2" } } });`,
      errors: [{ messageId: "physical" }],
    },
  ],
});
