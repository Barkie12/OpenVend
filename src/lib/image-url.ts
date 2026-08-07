/** Public URL for a stored product image. Client-safe (no Node imports). */
export function imageUrl(relativePath: string): string {
  return `/api/files/${relativePath}`;
}
