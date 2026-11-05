import path from 'node:path';

export const DATABASE_PATHS = {
  sqlite: path.resolve(process.cwd(), 'wonbee.sqlite'),
  userData: path.resolve(process.cwd(), 'user_data.json'),
  defaultData: path.resolve(process.cwd(), 'public/wonbee_data.json'),
} as const;

export const DATABASE_IMAGE_PATTERNS = {
  dataUri: /data:image\/([a-zA-Z0-9.+_-]+);base64,([A-Za-z0-9+/=\r\n]+)/i,
  imageTag: /<img[^>]+src=["'](data:image\/([a-zA-Z0-9.+_-]+);base64,([^"']+))["'][^>]*>/i,
} as const;
