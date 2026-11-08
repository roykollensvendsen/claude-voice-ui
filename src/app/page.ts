// One session's own page: reading its parts, and the turns that come after the last one shown.
import { SignedOut } from "../bridge";
import type { Context } from "./context";

export interface SessionPage {
  open(id: string): void;
  moreOutput(id: string): Promise<void>;
  readDetail(id: string): Promise<void>;
  readPending(id: string): Promise<void>;
}

export function sessionPage({ home, deps, draw, failed }: Context): SessionPage {
  /** Read one part of the open page, unless the owner has moved on to another. */
  async function load<T>(id: string, read: () => Promise<T>, put: (value: T) => void) {
    try {
      const value = await read();
      if (home.open?.id !== id) return;
      put(value);
      draw();
    } catch (error) {
      if (error instanceof SignedOut) failed(error);
    }
  }

  function open(id: string) {
    home.open = { id, turns: [], lastIndex: undefined, pending: null, prs: [], info: null };
    draw();
    void readDetail(id);
    void moreOutput(id);
    void readPending(id);
    void load(
      id,
      () => deps.bridge.prs(id),
      (r) => {
        if (home.open) home.open.prs = r.prs;
      },
    );
  }

  function moreOutput(id: string): Promise<void> {
    const after = home.open?.lastIndex;
    let more = false;
    return load(
      id,
      // RULE: a new turn announced on the stream is fetched after the last one shown
      () => deps.bridge.output(id, home.open?.lastIndex),
      (out) => {
        if (!home.open) return;
        home.open.turns.push(...out.turns);
        home.open.lastIndex = out.next_after || home.open.turns.at(-1)?.index;
        // The stream names only the last of several new turns, and one read brings at most six.
        // A first read without `after` is the latest six; what is left then is older, and stays out.
        more = after !== undefined && out.turns_left > 0 && out.turns.length > 0;
      },
    ).then(() => (more ? moreOutput(id) : undefined));
  }

  function readDetail(id: string) {
    return load(
      id,
      () => deps.bridge.detail(id),
      (d) => {
        // Another machine's session comes back as its plain row, with no transcript facts to show.
        if (home.open) home.open.info = d?.tool_calls ? d : null;
      },
    );
  }

  function readPending(id: string) {
    return load(
      id,
      () => deps.bridge.pending(id),
      (p) => {
        if (home.open) home.open.pending = p;
      },
    );
  }

  return { open, moreOutput, readDetail, readPending };
}
