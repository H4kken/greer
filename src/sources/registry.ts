import { createHnSource } from "./hn";
import type { Platform, Source } from "./types";

const sources: Record<Platform, () => Source> = {
  hn: () => createHnSource(),
};

export function getSource(platform: Platform): Source {
  return sources[platform]();
}
