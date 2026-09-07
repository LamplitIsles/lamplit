// Add reviewed screenshots to static/images, then set their root-relative paths.
// Keep null until real, permission-cleared captures are available.
export const media: Record<'keet' | 'memory', { src: string; width: number; height: number } | null> = {
  keet: null,
  memory: null
};
