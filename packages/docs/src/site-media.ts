/**
 * Website videos served from the remote-arc-public-media R2 bucket through the same
 * approved /media/demo-gallery/ route as the use-case gallery. Filenames carry the first
 * 12 hex characters of their SHA-256; bytes stay outside Git.
 */
export type SiteVideo = {
  id: string;
  language: "en" | "zh";
  video: string;
  sha256: string;
  poster: string;
  posterSha256: string;
  width: number;
  height: number;
  duration: number;
};

/** The homepage product film, one edition per website language. */
export const PRODUCT_FILMS: SiteVideo[] = [
  {
    id: "product-film-en",
    language: "en",
    video: "remote-arc-film-en-04f2250f970d.mp4",
    sha256: "04f2250f970dee6e72811c107cfd91dea8dcd0e16899d70c6a8bec026cb36271",
    poster: "remote-arc-film-en-poster-8b2acd940d89.webp",
    posterSha256: "8b2acd940d891c00cf3821b8c9a81544776d1c4bde0408cc68c14291d53a37e4",
    width: 1920,
    height: 1080,
    duration: 55.8,
  },
  {
    id: "product-film-zh",
    language: "zh",
    video: "remote-arc-film-zh-95b6aad80905.mp4",
    sha256: "95b6aad8090543005bb81f3d4779cbb7c688f6c53364b4ea60fefa8c933ae8ec",
    poster: "remote-arc-film-zh-poster-9ed4292de0e2.webp",
    posterSha256: "9ed4292de0e2e443fb3ccd0d29e78f742f3605d5ad32b1bb65d08489ff850cf9",
    width: 1920,
    height: 1080,
    duration: 55.8,
  },
];

/** Archived ChatGPT session retained for existing direct media links. */
export const PLUGIN_DEMO: SiteVideo = {
  id: "chatgpt-plugin-demo",
  language: "en",
  video: "remote-arc-plugin-demo-4afac5a39e12.mp4",
  sha256: "4afac5a39e12f205ef83970050d199fa08f8cae582eb967fb629f452104b2c84",
  poster: "remote-arc-plugin-demo-poster-d4db1fa3b7b6.webp",
  posterSha256: "d4db1fa3b7b6df88e10da59dd1064f708d6baabd969f2c97adf7b7923d3d1cff",
  width: 1920,
  height: 1200,
  duration: 481.1,
};

export const SITE_VIDEOS: SiteVideo[] = [...PRODUCT_FILMS, PLUGIN_DEMO];

export const productFilm = (language: string) =>
  PRODUCT_FILMS.find((film) => film.language === language) ?? PRODUCT_FILMS[0]!;
