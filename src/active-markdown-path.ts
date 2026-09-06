export class ActiveMarkdownPathTracker {
  private currentPath: string | null = null;

  synchronize(path: string | null): void {
    this.currentPath = path;
  }

  shouldRefresh(path: string | null): boolean {
    if (path === this.currentPath) return false;
    this.currentPath = path;
    return true;
  }
}
