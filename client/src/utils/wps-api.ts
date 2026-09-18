import { createWps365, setDevErrorReporter } from "@ks-open/capability/wps365";
import type { DevErrorDetail } from "@ks-open/capability/wps365";

const sdk = createWps365({
  usage: { capabilityKey: "wps365/dbsheet" },
});

if (import.meta.env.DEV) {
  setDevErrorReporter((detail: DevErrorDetail) => {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/__dev-error", JSON.stringify(detail));
    }
  });
}

// 博客多维表配置
export const BLOG_DB_FILE_ID = "Mm7X2oX261MrecrCKUZfxx1VP1EGEhiyU";
export const ARTICLES_SHEET_ID = "2";
export const COMMENTS_SHEET_ID = "3";

// 字段ID映射
export const ARTICLES_FIELDS = {
  TITLE: "F",
  CONTENT: "G",
  CATEGORY: "H",
  TAGS: "I",
  PUBLISH_DATE: "J",
  SUMMARY: "K",
  VIEW_COUNT: "L",
  STATUS: "M",
} as const;

export const COMMENTS_FIELDS = {
  ARTICLE_ID: "N",
  AUTHOR: "O",
  EMAIL: "P",
  CONTENT: "Q",
  CREATE_TIME: "R",
} as const;

export { sdk as wps365 };
