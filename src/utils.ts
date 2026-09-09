import * as path from 'path';

export function isPathSafe(baseDir: string, targetPath: string): boolean {
  const resolvedPath = path.resolve(baseDir, targetPath);
  return resolvedPath.startsWith(baseDir);
}

export function sanitizePath(baseDir: string, targetPath: string): string {
  const resolvedPath = path.resolve(baseDir, targetPath);
  if (!resolvedPath.startsWith(baseDir)) {
    throw new Error(`Path traversal detected or path outside project root: ${targetPath}`);
  }
  return resolvedPath;
}

