import type pg from "pg";
import { AccountRepo } from "./accounts.ts";
import { CharacterRepo } from "./characters.ts";
import { ClanRepo } from "./clans.ts";
import { SocialRepo } from "./social.ts";
import { WorldRepo } from "./world.ts";

/** All repositories, constructed once and injected into HTTP routes and rooms. */
export interface Repos {
  accounts: AccountRepo;
  characters: CharacterRepo;
  clans: ClanRepo;
  social: SocialRepo;
  world: WorldRepo;
}

export function createRepos(db: pg.Pool): Repos {
  return {
    accounts: new AccountRepo(db),
    characters: new CharacterRepo(db),
    clans: new ClanRepo(db),
    social: new SocialRepo(db),
    world: new WorldRepo(db),
  };
}
