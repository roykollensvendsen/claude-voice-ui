import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { start } from "../src/app";
import { pickLanguage, plural, setLanguage, t } from "../src/i18n";
import { FakeSource, fakeBridge, ONE, session } from "./fakes";

let root: HTMLElement;
let stop: (() => void) | undefined;

async function open(sessions = [ONE]) {
  stop = start(root, {
    bridge: fakeBridge([{ sessions, active: null }]),
    openEvents: (url) => new FakeSource(url),
  });
  await vi.advanceTimersByTimeAsync(0);
}

const openMenu = () => root.querySelector<HTMLButtonElement>("header .menu-toggle")?.click();
const language = (label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>(".menu .language button")].find(
    (b) => b.textContent === label,
  );
const viewSwitch = () => [...root.querySelectorAll(".view-switch button")].map((b) => b.textContent);

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("main");
  document.body.replaceChildren(root);
  localStorage.clear();
  setLanguage("en");
});

afterEach(() => {
  stop?.();
  stop = undefined;
  setLanguage("en");
  vi.useRealTimers();
});

describe("the phone's language", () => {
  test.each([
    [["nb-NO", "en"], "nb"],
    [["no"], "nb"],
    [["nn-NO"], "nb"],
    [["es-ES"], "es"],
    [["es-419", "en"], "es"],
    [["de-DE", "es"], "es"],
    [["de-DE"], "en"],
    [[], "en"],
  ])("a phone set to %j is shown in %s", (prefs, lang) => {
    expect(pickLanguage(prefs)).toBe(lang);
  });
});

describe("the words", () => {
  test("a text fills in its blanks", () => {
    expect(t("focus.chosenBy", { who: "voice" })).toBe("chosen by voice");
    setLanguage("nb");
    expect(t("focus.chosenBy", { who: "voice" })).toBe("valgt av voice");
  });

  test("a count picks the right form for the language", () => {
    expect(plural(1, "hidden.count")).toBe("1 hidden session");
    expect(plural(3, "hidden.count")).toBe("3 hidden sessions");
    setLanguage("es");
    expect(plural(3, "hidden.count")).toBe("3 sesiones ocultas");
  });
});

describe("choosing a language", () => {
  test("the page follows the phone's language until one is chosen", async () => {
    await open();
    openMenu();
    expect(language("Like the phone")?.getAttribute("aria-pressed")).toBe("true");
    expect(viewSwitch()).toContain("Grid");
  });

  test("the menu switches the page to Norwegian or Spanish", async () => {
    await open();
    openMenu();
    language("Norsk")?.click();
    expect(viewSwitch()).toEqual(["?", "Rutenett", "Kort"]);
    expect(root.querySelector(".menu button.signout")?.textContent).toBe("Logg ut");
    language("Español")?.click();
    expect(viewSwitch()).toEqual(["?", "Cuadrícula", "Tarjetas"]);
  });

  test("the language chosen is remembered", async () => {
    await open();
    openMenu();
    language("Norsk")?.click();
    stop?.();
    setLanguage("en");
    root.replaceChildren();
    await open();
    expect(viewSwitch()).toContain("Rutenett");
  });

  test("what the sessions say is shown as it is, in any language", async () => {
    localStorage.setItem("cvu.lang", JSON.stringify("nb"));
    localStorage.setItem("cvu.view", JSON.stringify("cards"));
    const asking = session({
      id: "q",
      name: "billing-ab",
      status: "waiting",
      question: { text: "Which file?", options: [] },
    });
    await open([asking]);
    expect(root.querySelector('[data-session="q"] .name')?.textContent).toBe("billing-ab");
    expect(root.querySelector('[data-session="q"] .line')?.textContent).toBe("Which file?");
    expect(root.querySelector('[data-session="q"] .state')?.textContent).toContain("Venter på svar");
  });
});
