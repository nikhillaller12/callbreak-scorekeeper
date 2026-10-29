import type { Avatar } from '../domain/types';

export const AVATAR_COLORS = ['#c0392b', '#d35400', '#b9770e', '#1e8449', '#117a65', '#2874a6', '#5b2c83', '#a93a73', '#566573', '#7b4a2a'];
export const AVATAR_EMOJIS = ['🦁', '🐯', '🦊', '🐻', '🐼', '🐸', '🦉', '🐙', '🦄', '🐲', '😎', '🤠', '👑', '🔥', '⚡', '🍀', '♠', '♥', '♦', '♣'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable, attractive default avatar for a name (initials on a colour). */
export function defaultAvatar(name: string): Avatar {
  return { color: AVATAR_COLORS[hash(name.trim().toLowerCase()) % AVATAR_COLORS.length] };
}

/** Centre-crop + downscale an uploaded/camera image to a small JPEG data URL. */
export async function imageFileToAvatarData(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That image could not be read.'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
