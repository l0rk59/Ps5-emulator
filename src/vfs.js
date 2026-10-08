// VFS en memoire : fichiers + descripteurs. Pas de PFS/PKG Sony.

export class Vfs {
  constructor() {
    this.files = new Map(); // path -> Uint8Array
    this.fds = new Map(); // fd -> { path, pos, mode }
    this.nextFd = 3;
  }
  normalize(path) { return path.startsWith('/') ? path : '/' + path; }
  open(path, mode = 'r') {
    path = this.normalize(path);
    if (!this.files.has(path)) {
      if (mode.includes('r') && !mode.includes('+') && !mode.includes('w')) return -1;
      this.files.set(path, new Uint8Array(0));
    }
    const fd = this.nextFd++;
    this.fds.set(fd, { path, pos: mode.startsWith('a') ? this.files.get(path).length : 0, mode });
    return fd;
  }
  read(fd, len) {
    const h = this.fds.get(fd);
    if (!h) return null;
    const data = this.files.get(h.path);
    const chunk = data.slice(h.pos, h.pos + len);
    h.pos += chunk.length;
    return chunk;
  }
  write(fd, bytes) {
    const h = this.fds.get(fd);
    if (!h) return -1;
    const cur = this.files.get(h.path);
    const need = h.pos + bytes.length;
    const out = new Uint8Array(Math.max(cur.length, need));
    out.set(cur, 0);
    out.set(bytes, h.pos);
    h.pos += bytes.length;
    this.files.set(h.path, out);
    return bytes.length;
  }
  close(fd) { return this.fds.delete(fd) ? 0 : -1; }
  readFile(path) { return this.files.get(this.normalize(path)) ?? null; }
}
