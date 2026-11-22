import { PenTool, type PenToolContext } from "./pen";

/** Same gesture as the pen; the strokes are tagged "highlighter" and drawn translucent and wide. */
export class HighlighterTool extends PenTool {
  constructor(ctx: Omit<PenToolContext, "strokeTool">) {
    super({ ...ctx, strokeTool: "highlighter" });
  }
}
