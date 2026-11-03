import { expect, type Locator } from "@playwright/test";

/**
 * Waits until React has hydrated the element, then returns it. A click or key press on a
 * client component's control before that does nothing, which made specs flaky on a busy
 * machine where hydration is slow. React stores an element's props under a
 * `__reactProps$…` key once it has hydrated it, so that key means its handlers are live.
 */
export async function hydrated(locator: Locator): Promise<Locator> {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
  return locator;
}
