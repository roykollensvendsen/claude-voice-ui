// What the parts of the app share: the state the screens are drawn from, and the means to redraw it.
import type { Bridge } from "../bridge";
import type { Change } from "../changes";
import type { EventSourceLike } from "../live";
import type { Keep } from "../remember";
import type { Home } from "../view";

export interface Deps {
  bridge: Bridge;
  openEvents: (url: string) => EventSourceLike;
  /** Where this phone remembers open and hidden cards; the browser's storage when left out. */
  keep?: Keep;
  /** The build this page came from, and how to ask which build is deployed now. */
  version?: { built: string; latest(): Promise<string>; changes?(): Promise<Change[]> };
  /** Load the page again; the browser's own reload when left out. */
  reload?: () => void;
}

export interface Context {
  home: Home;
  deps: Deps;
  keep: Keep | undefined;
  /** Draw the screen again from `home`, unless a finger or a typed answer holds it still. */
  draw(): void;
  /** Back to the sign-in page when signed out; otherwise a notice that the bridge did not answer. */
  failed(error: unknown): void;
  /** Whether the app is signed in and following the bridge. */
  watching(): boolean;
}
