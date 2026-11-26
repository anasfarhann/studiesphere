"use client";

import { createContext, useContext } from "react";
import type { PreviewTarget } from "../preview/page-preview";

/** The mounted canvas's live scene, drawable by the renderer; null until the editor exists. Never to be destroyed by users. */
const LivePageTargetContext = createContext<PreviewTarget | null>(null);
export const LivePageTargetProvider = LivePageTargetContext.Provider;
/** The live editor scene of the canvas page this component is rendered in (e.g. its header), if mounted. */
export const useLivePageTarget = (): PreviewTarget | null => useContext(LivePageTargetContext);
