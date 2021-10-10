import {
  BaseSource,
  Candidate,
  DdcEvent,
} from "https://deno.land/x/ddc_vim@v0.14.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnEventArguments,
} from "https://deno.land/x/ddc_vim@v0.14.0/base/source.ts#^";
import { fn } from "https://deno.land/x/ddc_vim@v0.14.0/deps.ts#^";

type DictCache = {
  mtime: Date | null;
  candidates: Candidate[];
};

export function isUpper(char: string) {
  return /[A-Z]/.test(char[0]);
}

type Params = {
  dictPaths: string[];
  smartcase: boolean;
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
      const content = Deno.readTextFileSync(dictFile) 
      const delimiter = content.includes("\r\n") ? "\r\n"
                      : content.includes("\r") ? "\r"
                      : "\n"
      const texts = content.split(delimiter);
      this.cache[dictFile] = {
        "mtime": mtime,
        "candidates": texts.map((word) => ({ word })),
      };
    }
  }

  async onInit(
    args: GatherCandidatesArguments<Params>,
  ): Promise<void> {
    await this.onEvent(args);
  }

  async onEvent({
    denops,
    sourceParams,
  }: OnEventArguments<Params>): Promise<void> {
    this.dicts = this.getDictionaries(
      (await fn.getbufvar(denops, 1, "&dictionary") as string),
    );
    const paths = sourceParams.dictPaths;
    if (paths && Array.isArray(paths)) {
      this.dicts = this.dicts.concat(paths as string[]);
    }
    this.makeCache();
  }

  async gatherCandidates({
    completeStr,
    sourceParams,
  }: GatherCandidatesArguments<Params>): Promise<Candidate[]> {
    if (!this.dicts) {
      return [];
    }

    const str = completeStr;
    const isFirstUpper = isUpper(str[0]);
    const isSecondUpper = str.length > 1 ? isUpper(str[1]) : false;
    return this.dicts.map((dict) => this.cache[dict].candidates)
      .flatMap((candidates) => candidates)
      .map((candidate) => {
        if (sourceParams.smartcase) {
          if (isSecondUpper) return { word: candidate.word.toUpperCase() };
          if (isFirstUpper) {
            return {
              word: candidate.word.replace(/^./, (m) => m.toUpperCase()),
            };
          }
        }
        return candidate;
      });
  }

  params(): Params {
    return {
      dictPaths: [],
      smartcase: true,
    };
  }
}
