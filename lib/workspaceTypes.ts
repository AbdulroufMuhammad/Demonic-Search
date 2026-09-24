export type ThreadItem =
  | { key: string; type: "user"; text: string; tag?: string }
  | { key: string; type: "text"; text: string; shown: string; caret: boolean }
  | { key: string; type: "error"; text: string }
  | {
      key: string;
      type: "tool";
      verb: string;
      active: boolean;
      detail: string;
      meta: string;
      rows: { k: string; t: string; d: string }[];
    };

export type SelInfo = {
  id: string;
  tag: string;
  text: string;
  locked: boolean;
  fs: number;
  lh: number;
  mb: number;
};
