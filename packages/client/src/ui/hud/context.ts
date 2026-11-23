import type { ClanInfo, PrivateState, WorldMap } from "@catgen/shared";
import type { Net, NetPlayer } from "../../game/net.ts";
import type { AccountInfo, CharacterSummary } from "../../api.ts";

export interface Settings {
  graphics: "high" | "low";
  showNames: boolean;
  chatFilter: boolean;
  uiScale: number;
}

export const DEFAULT_SETTINGS: Settings = { graphics: "high", showNames: true, chatFilter: true, uiScale: 1 };

/** Shared, live data for HUD components. */
export interface HudContext {
  net: Net;
  map: WorldMap;
  character: CharacterSummary;
  account: AccountInfo;
  priv: PrivateState | null;
  clan: ClanInfo | null;
  me: NetPlayer | null;
  settings: Settings;
  /** Re-render whichever side panel is open. */
  refreshPanel(): void;
  openPanel(name: PanelName | null): void;
  whisper(name: string): void;
}

export type PanelName = "inventory" | "clan" | "social" | "settings" | "herbs" | "help" | "emotes";
