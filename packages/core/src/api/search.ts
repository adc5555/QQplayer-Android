import type { PlatformName, SearchPage, Track } from "../types.js";
import { getSearchId } from "../utils/common.js";
import { mapTrackList } from "./song.js";
import type { QqMusicClient } from "../client.js";

export class SearchApi {
  constructor(private readonly client: QqMusicClient, private readonly platform: PlatformName) {}

  async search(keyword: string, page = 1, pageSize = 15): Promise<SearchPage> {
    const data = await this.client.execute({
      module: "music.search.SearchCgiService",
      method: "DoSearchForQQMusicMobile",
      param: {
        searchid: getSearchId(),
        query: keyword,
        search_type: 0,
        num_per_page: pageSize,
        page_num: page,
        highlight: true,
        grp: true
      },
      platform: "android"
    });
    const list = readSongList(data);
    const tracks = mapTrackList(list);
    return { keyword, page, tracks, hasMore: list.length >= pageSize };
  }
}

function readSongList(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, any>;
  const body = record.body ?? record.data?.body ?? record;
  const list =
    body?.item_song ??
    body?.song?.list ??
    body?.data?.song?.list ??
    body?.songlist ??
    [];
  return Array.isArray(list) ? list : [];
}
