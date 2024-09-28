import type { DdcEvent, Item } from "jsr:@shougo/ddc-vim@7.1.0/types";
import {
  BaseSource,
  type GatherArguments,
  type OnEventArguments,
} from "jsr:@shougo/ddc-vim@7.1.0/source";
import * as fn from "jsr:@denops/std@7.2.0/function";
import { assertEquals } from "jsr:@std/assert@1.0.6";

type DictCache = {
  mtime: Date | null;
  candidates: Item[];
};

export function isUpper(char: string) {
  return /[A-Z]/.test(char[0]);
}

function extractLastWord(
  str: string,
): [string, number] {
  if (str.match(/[^a-zA-Z]$/)) {
    return ["", str.length];
  }
  const upperCaseRegexp = /[A-Z][A-Z]+$/;
  const camelCaseRegexp = /[A-Z][a-z]*$/; // Also matched to PascalCase
  const snakeCaseRegexp = /[a-z][a-z]*$/; // Also matched to kebab-case, etc.
  let matches: string[] | null = str.match(upperCaseRegexp);
  if (matches === null) matches = str.match(camelCaseRegexp);
  if (matches === null) matches = str.match(snakeCaseRegexp);
  if (matches === null) return [str, 0];
  const lastWord = matches.at(-1) || str;
  const offset = str.lastIndexOf(lastWord);
  return [lastWord, offset];
}

type Params = {
  dictPaths: string[];
  smartcase: boolean;
  showMenu: boolean;
};

export class Source extends BaseSource<Params> {
  private cache: { [filename: string]: DictCache } = {};
  private dicts: string[] = [];
  private lastPrecedingLetters: string | undefined = undefined;
  private lastItems: Item[] | undefined = undefined;
  private simplestItems: Item[] | undefined = undefined;
  events = ["InsertEnter"] as DdcEvent[];

  private getDictionaries(dictOpt: string): string[] {
    if (dictOpt) {
      return dictOpt.split(",");
    } else {
      return [];
    }
  }

  private makeCache(): void {
    if (!this.dicts) {
      return;
    }

    for (const dictFile of this.dicts) {
      const mtime = Deno.statSync(dictFile).mtime;
      if (
        dictFile in this.cache &&
        this.cache[dictFile].mtime?.getTime() == mtime?.getTime()
      ) {
        return;
      }
      const texts = Deno.readTextFileSync(dictFile).split(/\r?\n/);
      this.cache[dictFile] = {
        "mtime": mtime,
        "candidates": texts.map((word) => ({ word, menu: dictFile })),
      };
    }
  }

  async onInit(
    args: GatherArguments<Params>,
  ): Promise<void> {
    await this.onEvent(args);
  }

  async onEvent({
    denops,
    sourceParams,
  }: OnEventArguments<Params>): Promise<void> {
    this.dicts = this.getDictionaries(
      await fn.getbufvar(denops, 1, "&dictionary") as string,
    );
    const paths = sourceParams.dictPaths;
    if (paths && Array.isArray(paths)) {
      this.dicts = this.dicts.concat(paths as string[]);
    }
    this.makeCache();
  }

  gather({
    completeStr,
    sourceParams,
  }: GatherArguments<Params>): Promise<Item[]> {
    if (!this.dicts) {
      return Promise.resolve([]);
    }

    const [lastWord, offset] = extractLastWord(completeStr);
    // Note: The early returns only makes sense when the option `isVolatile` is
    // set to true.
    if (offset === 0 && this.simplestItems) {
      return Promise.resolve(this.simplestItems);
    }
    const precedingLetters = completeStr.slice(0, offset);
    if (
      this.lastItems &&
      this.lastPrecedingLetters === precedingLetters
    ) {
      return Promise.resolve(this.lastItems);
    }
    this.lastPrecedingLetters = precedingLetters;
    const isFirstUpper = lastWord.length ? isUpper(lastWord[0]) : false;
    const isSecondUpper = lastWord.length > 1 ? isUpper(lastWord[1]) : false;
    return Promise.resolve((() => {
      const items = this.dicts.map((dict) => this.cache[dict].candidates)
        .flatMap((candidates) => candidates)
        .map((candidate) => {
          let word = candidate.word;
          if (sourceParams.smartcase) {
            if (isSecondUpper) return { word: candidate.word.toUpperCase() };
            if (isFirstUpper) {
              word = candidate.word.replace(/^./, (m) => m.toUpperCase());
            }
          }
          return {
            word: word,
            menu: sourceParams.showMenu ? candidate.menu : "",
          };
        })
        .map((candidate) => {
          candidate.word = precedingLetters.concat(candidate.word);
          return candidate;
        });
      if (offset > 0) {
        this.lastItems = items;
      } else if (this.simplestItems === undefined) {
        this.simplestItems = items;
      }
      return items;
    })());
  }

  params(): Params {
    return {
      dictPaths: [],
      smartcase: true,
      showMenu: true,
    };
  }
}

Deno.test("extractLastWord", () => {
  assertEquals(
    extractLastWord("input"),
    ["input", 0],
  );
  assertEquals(
    extractLastWord("UPPER_CASE_INPUT"),
    ["INPUT", 11],
  );
  assertEquals(
    extractLastWord("camelCaseInput"),
    ["Input", 9],
  );
  assertEquals(
    extractLastWord("_snake_case_input"),
    ["input", 12],
  );
  assertEquals(
    extractLastWord("_unfinished_input_"),
    ["", 18],
  );
  assertEquals(
    extractLastWord("unfinishedI"),
    ["I", 10],
  );
  assertEquals(
    extractLastWord("_i"),
    ["i", 1],
  );
});
