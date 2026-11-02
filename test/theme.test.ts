import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { FakeSource, fakeBridge, ONE } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open() {
  stop = start(root, {
    bridge: fakeBridge([{ sessions: [ONE], active: null }]),
    openEvents: (url) => new FakeSource(url),
  });
  await vi.advanceTimersByTimeAsync(0);
}

const openMenu = () => root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
const choice = (label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>(".menu .theme button")].find((b) => b.textContent === label);
const theme = () => document.documentElement.dataset.theme;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe("light, dark, or like the phone", () => {
  test("the page follows the phone until a theme is chosen", async () => {
    await open();
    expect(theme()).toBeUndefined();
    expect(root.querySelector(".menu")).toBeNull();
    openMenu();
    expect(choice("Like the phone")?.getAttribute("aria-pressed")).toBe("true");
  });

  test("the menu sets the page light or dark, and back to the phone's", async () => {
    await open();
    openMenu();
    choice("Light")?.click();
    expect(theme()).toBe("light");
    choice("Dark")?.click();
    expect(theme()).toBe("dark");
    expect(choice("Dark")?.getAttribute("aria-pressed")).toBe("true");
    choice("Like the phone")?.click();
    expect(theme()).toBeUndefined();
  });

  test("the theme chosen is remembered", async () => {
    await open();
    openMenu();
    choice("Light")?.click();
    stop?.();
    delete document.documentElement.dataset.theme;
    root.replaceChildren();
    await open();
    expect(theme()).toBe("light");
  });

  test("signing out is in the same menu", async () => {
    await open();
    expect(root.querySelector("header > .signout")).toBeNull();
    openMenu();
    expect(root.querySelector(".menu button.signout")?.textContent).toBe("Sign out");
  });
});
