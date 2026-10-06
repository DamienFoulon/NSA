import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StoredUser {
  nsaId: string;
  name: string;
  /** SHA-256 of the agent token: a leaked file does not leak usable tokens */
  tokenHash: string;
  linkedAt: string;
}

interface StoreFile {
  version: 1;
  users: StoredUser[];
  friendRequests: { day: string; count: number };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Linked users, persisted as a small JSON file (at most ~300 entries). */
export class UserStore {
  private writing = Promise.resolve();

  private constructor(private readonly path: string, private readonly data: StoreFile) {}

  static async open(dir: string): Promise<UserStore> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, 'users.json');
    let data: StoreFile;
    try {
      data = JSON.parse(await readFile(path, 'utf8')) as StoreFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      data = { version: 1, users: [], friendRequests: { day: '', count: 0 } };
    }
    return new UserStore(path, data);
  }

  get size(): number {
    return this.data.users.length;
  }

  findByToken(token: string): StoredUser | undefined {
    const hash = hashToken(token);
    return this.data.users.find(u => u.tokenHash === hash);
  }

  has(nsaId: string): boolean {
    return this.data.users.some(u => u.nsaId === nsaId);
  }

  /** Links a user, replacing any previous token, and returns the new token. */
  async link(nsaId: string, name: string, now = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const user: StoredUser = { nsaId, name, tokenHash: hashToken(token), linkedAt: now.toISOString() };
    this.data.users = [...this.data.users.filter(u => u.nsaId !== nsaId), user];
    await this.save();
    return token;
  }

  async remove(nsaId: string): Promise<void> {
    this.data.users = this.data.users.filter(u => u.nsaId !== nsaId);
    await this.save();
  }

  /** Counts a friend request against the daily cap; false when the cap is reached. */
  async takeFriendRequest(max: number, now = new Date()): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    const counter = this.data.friendRequests.day === day ? this.data.friendRequests : { day, count: 0 };
    if (counter.count >= max) return false;
    this.data.friendRequests = { day, count: counter.count + 1 };
    await this.save();
    return true;
  }

  /** Writes atomically (temp file + rename), one write at a time. */
  private save(): Promise<void> {
    const content = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, content, { mode: 0o600 });
      await rename(tmp, this.path);
    });
    return this.writing;
  }
}
