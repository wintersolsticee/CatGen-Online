import type pg from "pg";

export interface FriendEntry {
  id: string;
  name: string;
  clan: string | null;
  status: "accepted" | "outgoing" | "incoming";
}

export class SocialRepo {
  constructor(private db: pg.Pool) {}

  async friends(characterId: string): Promise<FriendEntry[]> {
    const r = await this.db.query(
      `SELECT c.id, c.name, c.clan,
         CASE WHEN f.status = 'accepted' THEN 'accepted' WHEN f.character_id = $1 THEN 'outgoing' ELSE 'incoming' END AS status
       FROM friendships f
       JOIN characters c ON c.id = CASE WHEN f.character_id = $1 THEN f.friend_id ELSE f.character_id END
       WHERE (f.character_id = $1 OR f.friend_id = $1) AND c.deleted_at IS NULL
       ORDER BY c.name`,
      [characterId],
    );
    return r.rows;
  }

  /** Send or accept a friend request. Returns the resulting status. */
  async addFriend(characterId: string, friendId: string): Promise<"accepted" | "pending"> {
    const incoming = await this.db.query(`SELECT 1 FROM friendships WHERE character_id=$1 AND friend_id=$2`, [friendId, characterId]);
    if ((incoming.rowCount ?? 0) > 0) {
      await this.db.query(`UPDATE friendships SET status='accepted' WHERE character_id=$1 AND friend_id=$2`, [friendId, characterId]);
      return "accepted";
    }
    await this.db.query(`INSERT INTO friendships (character_id, friend_id, status) VALUES ($1,$2,'pending') ON CONFLICT DO NOTHING`, [characterId, friendId]);
    return "pending";
  }

  async removeFriend(characterId: string, friendId: string): Promise<void> {
    await this.db.query(`DELETE FROM friendships WHERE (character_id=$1 AND friend_id=$2) OR (character_id=$2 AND friend_id=$1)`, [characterId, friendId]);
  }

  async blocked(characterId: string): Promise<{ id: string; name: string }[]> {
    const r = await this.db.query(`SELECT c.id, c.name FROM blocks b JOIN characters c ON c.id=b.blocked_id WHERE b.character_id=$1`, [characterId]);
    return r.rows;
  }

  async block(characterId: string, blockedId: string): Promise<void> {
    await this.db.query(`INSERT INTO blocks (character_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [characterId, blockedId]);
    await this.removeFriend(characterId, blockedId);
  }

  async unblock(characterId: string, blockedId: string): Promise<void> {
    await this.db.query(`DELETE FROM blocks WHERE character_id=$1 AND blocked_id=$2`, [characterId, blockedId]);
  }

  async report(reporterId: string, targetId: string | null, targetName: string, reason: string, context: unknown[]): Promise<void> {
    await this.db.query(`INSERT INTO reports (reporter_id, target_id, target_name, reason, context) VALUES ($1,$2,$3,$4,$5)`, [reporterId, targetId, targetName, reason, JSON.stringify(context)]);
  }

  async openReports(limit = 50): Promise<unknown[]> {
    const r = await this.db.query(`SELECT r.id, r.target_name, r.reason, r.context, r.created_at, c.name AS reporter FROM reports r JOIN characters c ON c.id=r.reporter_id WHERE NOT resolved ORDER BY created_at DESC LIMIT $1`, [limit]);
    return r.rows;
  }

  async resolveReport(id: number): Promise<void> {
    await this.db.query(`UPDATE reports SET resolved=true WHERE id=$1`, [id]);
  }
}
