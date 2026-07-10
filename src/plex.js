import { XMLParser } from "fast-xml-parser";
import { scoreMedia } from "./scoring.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: true
});

const PLEX_HEADERS = {
  Accept: "application/json",
  "X-Plex-Product": "Deduplarr",
  "X-Plex-Version": "0.1.0",
  "X-Plex-Client-Identifier": "deduplarr-local",
  "X-Plex-Platform": "Docker",
  "X-Plex-Device": "Deduplarr"
};

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function extensionFromPath(filePath) {
  const basename = text(filePath).split(/[\\/]/).pop() || "";
  const dot = basename.lastIndexOf(".");
  return dot >= 0 ? basename.slice(dot + 1).toLowerCase() : "";
}

function fileNameFromPath(filePath) {
  return text(filePath).split(/[\\/]/).pop() || text(filePath);
}

function normalizeBaseUrl(input) {
  const trimmed = text(input).trim();
  if (!trimmed) throw new Error("Plex URL is required.");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function metadataList(container) {
  return asArray(container?.Metadata);
}

function directoryList(container) {
  return asArray(container?.Directory);
}

function streamGroups(part) {
  const streams = asArray(part?.Stream);
  return {
    video: streams.find((stream) => number(stream.streamType || stream.type) === 1) || {},
    audio: streams.filter((stream) => number(stream.streamType || stream.type) === 2),
    subtitles: streams.filter((stream) => number(stream.streamType || stream.type) === 3)
  };
}

function groupTitle(item) {
  if (item.type === "episode") {
    const show = item.grandparentTitle || "Unknown Show";
    const season = String(number(item.parentIndex)).padStart(2, "0");
    const episode = String(number(item.index)).padStart(2, "0");
    return `${show} - S${season}E${episode} - ${item.title || "Untitled"}`;
  }

  return item.title || "Untitled";
}

function groupSubtitle(item) {
  const parts = [];
  if (item.year) parts.push(item.year);
  if (item.type) parts.push(item.type);
  if (item.originallyAvailableAt) parts.push(item.originallyAvailableAt);
  return parts.join(" | ");
}

function bestAudioStream(audioStreams) {
  return [...audioStreams].sort((a, b) => {
    const channels = number(b.channels) - number(a.channels);
    if (channels !== 0) return channels;
    return number(b.bitrate) - number(a.bitrate);
  })[0] || {};
}

function flattenVersions(item, library) {
  const mediaItems = asArray(item.Media);
  const records = [];

  mediaItems.forEach((media, mediaIndex) => {
    const parts = asArray(media.Part);

    parts.forEach((part, partIndex) => {
      const streams = streamGroups(part);
      const audio = bestAudioStream(streams.audio);
      const extension = extensionFromPath(part.file) || text(part.container || media.container);
      const record = {
        id: [
          item.ratingKey,
          media.id || mediaIndex,
          part.id || partIndex
        ].join(":"),
        libraryKey: text(library.key),
        libraryTitle: library.title,
        type: item.type,
        ratingKey: text(item.ratingKey),
        metadataKey: item.key || `/library/metadata/${item.ratingKey}`,
        mediaId: text(media.id || ""),
        mediaIndex,
        partId: text(part.id || ""),
        partIndex,
        partKey: text(part.key || ""),
        title: groupTitle(item),
        subtitle: groupSubtitle(item),
        file: text(part.file),
        fileName: fileNameFromPath(part.file),
        extension,
        container: text(part.container || media.container || extension),
        size: number(part.size),
        duration: number(part.duration || media.duration || item.duration),
        bitrate: number(media.bitrate || part.bitrate),
        width: number(media.width || streams.video.width),
        height: number(media.height || streams.video.height),
        videoCodec: text(media.videoCodec || streams.video.codec),
        videoResolution: text(media.videoResolution || ""),
        videoProfile: text(part.videoProfile || media.videoProfile || streams.video.profile),
        audioCodec: text(media.audioCodec || audio.codec),
        audioChannels: number(media.audioChannels || audio.channels),
        audioProfile: text(part.audioProfile || media.audioProfile || audio.profile),
        optimizedForStreaming: Boolean(
          part.optimizedForStreaming || media.optimizedForStreaming
        ),
        exists: part.exists === undefined ? undefined : Boolean(part.exists),
        accessible: part.accessible === undefined ? undefined : Boolean(part.accessible),
        video: streams.video,
        audioStreams: streams.audio,
        subtitleStreams: streams.subtitles
      };

      record.score = scoreMedia(record);
      records.push(record);
    });
  });

  return records.sort((a, b) => b.score.value - a.score.value);
}

function duplicateReason(item, files, cameFromDuplicateFilter) {
  const mediaCount = asArray(item.Media).length;
  if (mediaCount > 1) return `${mediaCount} media versions`;
  if (cameFromDuplicateFilter && files.length > 1) return `${files.length} file parts`;
  return "multiple files";
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export class PlexClient {
  constructor(config) {
    this.baseUrl = normalizeBaseUrl(config.plexUrl);
    this.token = config.plexToken;
    this.pageSize = Math.max(25, Math.min(Number(config.scanPageSize || 200), 1000));
    if (!this.token) throw new Error("Plex token is required.");
  }

  buildUrl(path, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set("X-Plex-Token", this.token);
    return url;
  }

  async request(path, params = {}, options = {}) {
    const response = await fetch(this.buildUrl(path, params), {
      method: options.method || "GET",
      headers: {
        ...PLEX_HEADERS,
        "X-Plex-Token": this.token,
        ...(options.headers || {})
      }
    });
    const body = await response.text();

    if (!response.ok) {
      const error = new Error(
        `Plex API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`
      );
      error.status = response.status;
      throw error;
    }

    if (!body) return {};

    try {
      return JSON.parse(body);
    } catch {
      return parser.parse(body);
    }
  }

  async serverInfo() {
    const data = await this.request("/");
    const container = data.MediaContainer || data;
    return {
      friendlyName: container.friendlyName || container.serverName || "Plex Media Server",
      machineIdentifier: container.machineIdentifier || "",
      version: container.version || "",
      platform: container.platform || "",
      platformVersion: container.platformVersion || ""
    };
  }

  async libraries() {
    const data = await this.request("/library/sections");
    const container = data.MediaContainer || data;
    return directoryList(container).map((directory) => ({
      key: text(directory.key),
      title: text(directory.title),
      type: text(directory.type),
      agent: text(directory.agent),
      scanner: text(directory.scanner),
      locations: asArray(directory.Location).map((location) => text(location.path))
    }));
  }

  async listSectionItems(library, onlyDuplicates = true, onPage = () => {}) {
    const type =
      library.type === "movie" ? 1 : library.type === "show" ? 4 : undefined;
    const items = [];
    let start = 0;
    let total = Infinity;

    while (start < total) {
      const params = {
        "X-Plex-Container-Start": start,
        "X-Plex-Container-Size": this.pageSize,
        includeGuids: 1,
        includeAdvanced: 1,
        includeMeta: 1,
        checkFiles: 1,
        ...(type ? { type } : {}),
        ...(onlyDuplicates ? { duplicate: 1 } : {})
      };

      const data = await this.request(`/library/sections/${library.key}/all`, params);
      const container = data.MediaContainer || data;
      const page = metadataList(container);
      items.push(...page);

      const size = number(container.size, page.length);
      total = number(container.totalSize, start + size);
      onPage({
        loaded: items.length,
        total,
        library
      });
      if (size === 0) break;
      start += size;
    }

    return items;
  }

  async itemDetails(ratingKey) {
    const data = await this.request(`/library/metadata/${ratingKey}`, {
      includeGuids: 1,
      includeAdvanced: 1,
      checkFiles: 1
    });
    const container = data.MediaContainer || data;
    return metadataList(container)[0] || null;
  }

  async duplicates(libraryKeys = [], options = {}) {
    const onProgress =
      typeof options.onProgress === "function" ? options.onProgress : () => {};
    const libraries = await this.libraries();
    const selected = libraries.filter((library) => {
      const supported = ["movie", "show", "video"].includes(library.type);
      const requested =
        libraryKeys.length === 0 || libraryKeys.includes(String(library.key));
      return supported && requested;
    });

    const allGroups = [];
    const errors = [];
    const totalLibraries = Math.max(selected.length, 1);
    onProgress({
      progress: selected.length ? 5 : 100,
      message: selected.length
        ? `Found ${selected.length} supported libraries`
        : "No supported libraries selected"
    });

    for (const [libraryIndex, library] of selected.entries()) {
      let items = [];
      let usedDuplicateFilter = true;
      const libraryBase = 5 + (libraryIndex / totalLibraries) * 90;
      const librarySpan = 90 / totalLibraries;
      const progressAt = (fraction) =>
        Math.round(libraryBase + librarySpan * Math.max(0, Math.min(1, fraction)));

      onProgress({
        progress: progressAt(0.05),
        message: `Reading ${library.title}`
      });

      try {
        items = await this.listSectionItems(library, true, ({ loaded, total }) => {
          const fraction = total ? Math.min(loaded / total, 1) : 0.2;
          onProgress({
            progress: progressAt(0.05 + fraction * 0.25),
            message: `Reading ${library.title}: ${loaded}/${total || "?"} items`
          });
        });
      } catch (error) {
        usedDuplicateFilter = false;
        try {
          items = await this.listSectionItems(library, false, ({ loaded, total }) => {
            const fraction = total ? Math.min(loaded / total, 1) : 0.2;
            onProgress({
              progress: progressAt(0.05 + fraction * 0.25),
              message: `Reading ${library.title}: ${loaded}/${total || "?"} items`
            });
          });
        } catch (fallbackError) {
          errors.push({
            library: library.title,
            message: fallbackError.message
          });
          continue;
        }
      }

      let detailedCount = 0;
      onProgress({
        progress: progressAt(0.35),
        message: `Inspecting ${items.length} duplicate candidates in ${library.title}`
      });
      const detailed = await mapLimit(items, 5, async (item) => {
        try {
          if (!item.ratingKey) return item;
          return (await this.itemDetails(item.ratingKey)) || item;
        } catch {
          return item;
        } finally {
          detailedCount += 1;
          const detailFraction = items.length ? detailedCount / items.length : 1;
          onProgress({
            progress: progressAt(0.35 + detailFraction * 0.45),
            message: `Inspecting ${library.title}: ${detailedCount}/${items.length} items`
          });
        }
      });

      onProgress({
        progress: progressAt(0.84),
        message: `Scoring duplicates in ${library.title}`
      });
      for (const item of detailed) {
        const files = flattenVersions(item, library);
        const mediaCount = asArray(item.Media).length;
        const isDuplicate =
          mediaCount > 1 || (usedDuplicateFilter && files.length > 1);

        if (!isDuplicate || files.length < 2) continue;

        allGroups.push({
          id: `${library.key}:${item.ratingKey}`,
          ratingKey: text(item.ratingKey),
          libraryKey: text(library.key),
          libraryTitle: library.title,
          type: item.type,
          title: groupTitle(item),
          subtitle: groupSubtitle(item),
          thumb: item.thumb || item.grandparentThumb || "",
          art: item.art || item.grandparentArt || "",
          year: item.year || "",
          duration: number(item.duration),
          reason: duplicateReason(item, files, usedDuplicateFilter),
          bestFileId: files[0]?.id || "",
          files
        });
      }

      onProgress({
        progress: progressAt(1),
        message: `Finished ${library.title}`
      });
    }

    const files = allGroups.flatMap((group) => group.files);
    onProgress({
      progress: 100,
      message: `Scan complete: ${allGroups.length} duplicate groups`
    });
    return {
      groups: allGroups.sort((a, b) => a.title.localeCompare(b.title)),
      stats: {
        libraries: selected.length,
        groups: allGroups.length,
        files: files.length,
        reclaimableBytes: files.reduce((sum, file) => {
          const group = allGroups.find((candidate) => candidate.id === `${file.libraryKey}:${file.ratingKey}`);
          return group?.bestFileId === file.id ? sum : sum + file.size;
        }, 0)
      },
      errors
    };
  }

  async deletePart(partKey) {
    if (!partKey || !partKey.startsWith("/library/parts/")) {
      throw new Error("A Plex media part key is required for file-level deletion.");
    }
    await this.request(partKey, {}, { method: "DELETE" });
    return { deleted: true, target: partKey };
  }
}
