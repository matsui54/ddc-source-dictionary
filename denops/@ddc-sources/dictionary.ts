import {
  BaseSource,
  DdcEvent,
  Item,
} from "https://deno.land/x/ddc_vim@v2.2.0/types.ts";
import {
  GatherArguments,
  OnEventArguments,
} from "https://deno.land/x/ddc_vim@v2.2.0/base/source.ts";
import { fn } from "https://deno.land/x/ddc_vim@v2.2.0/deps.ts";

type DictCache = {
  mtime: Date | null;
  candidates: Item[];
};

export function isUpper(char: string) {
  return /[A-Z]/.test(char[0]);
}

type Params = {
  dictPaths: string[];
  smartcase: boolean;
  showMenu: boolean;
};

export class Source extends BaseSource<Params> {
  private cache: { [filename: string]: DictCache } = {};
  private dicts: string[] = [];
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

    const str = completeStr;
    const isFirstUpper = str.length ? isUpper(str[0]) : false;
    const isSecondUpper = str.length > 1 ? isUpper(str[1]) : false;
    return Promise.resolve(
      this.dicts.map((dict) => this.cache[dict].candidates)
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
        }),
    );
  }

  params(): Params {
    return {
      dictPaths: [],
      smartcase: true,
      showMenu: true,
    };
  }
}
