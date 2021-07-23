import {
  BaseSource,
  Candidate,
  Context,
  Denops,
  SourceOptions,
} from "https://deno.land/x/ddc_vim@v0.0.4/types.ts";

type DictCache = {
  mtime: Date | null;
  candidates: Candidate[];
};

export class Source extends BaseSource {
  private cache: { [filename: string]: DictCache } = {};

  private getDictionaries(dictOpt: string): string[] {
    return dictOpt.split(",");
  }

  private makeCache(dictOpt: string): void {
    if (!dictOpt) {
      return;
    }

    for (const dictFile of (this.getDictionaries(dictOpt))) {
      const mtime = Deno.statSync(dictFile).mtime;
      if (dictFile in this.cache && this.cache[dictFile].mtime == mtime) {
        return;
      }
      const texts = Deno.readTextFileSync(dictFile).split("\n");
      this.cache[dictFile] = {
        "mtime": mtime,
        "candidates": texts.map((word) => ({ word })).sort(),
      };
    }
  }

  async gatherCandidates(
    denops: Denops,
    _context: Context,
    _options: SourceOptions,
    _params: Record<string, unknown>,
  ): Promise<Candidate[]> {
    // Note: denops.vim does not have options support...
    if (!Object.keys(this.cache).length) {
      const dictOpt =
        (await denops.call("getbufvar", 1, "&dictionary")) as string;
      this.makeCache(dictOpt);
    }
    const candidates: Candidate[] = [];
    Object.keys(this.cache)
      .map((file) => {
        this.cache[file].candidates.map((candidate) => {
          candidates.push(candidate);
        });
      });

    return candidates;
  }
}
