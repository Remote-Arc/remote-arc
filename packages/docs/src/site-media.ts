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

/**
 * The 46-second promo film (live-action footage, CG data centre and site UI captures),
 * pinned above the product film on /demo and shown on /about. One edition per language.
 */
export const PROMO_FILMS: SiteVideo[] = [
  {
    id: "promo-film-en",
    language: "en",
    video: "remote-arc-promo-en-f500ba4a2c1f.mp4",
    sha256: "f500ba4a2c1fc0541933d041a298fead069d8846894c646468f7b1402cffc83e",
    poster: "remote-arc-promo-en-poster-e35d27296354.webp",
    posterSha256: "e35d272963543f10625e2622edd1fc2850b869a4e2ea1082ec3c81894dfd2d0e",
    width: 1920,
    height: 1080,
    duration: 46.0,
  },
  {
    id: "promo-film-zh",
    language: "zh",
    video: "remote-arc-promo-zh-c228174ec7f9.mp4",
    sha256: "c228174ec7f955209147b2fdf063f86134838d07cec5b662dd31fdca25d91b02",
    poster: "remote-arc-promo-zh-poster-6a2b4d3d1782.webp",
    posterSha256: "6a2b4d3d178292734f9a2a95526321a26686c3002e72d76a137ea0f52cb86e9b",
    width: 1920,
    height: 1080,
    duration: 46.0,
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

export const SITE_VIDEOS: SiteVideo[] = [...PROMO_FILMS, ...PRODUCT_FILMS, PLUGIN_DEMO];

export const productFilm = (language: string) =>
  PRODUCT_FILMS.find((film) => film.language === language) ?? PRODUCT_FILMS[0]!;

export const promoFilm = (language: string) =>
  PROMO_FILMS.find((film) => film.language === language) ?? PROMO_FILMS[0]!;
