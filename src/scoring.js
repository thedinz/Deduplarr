const VIDEO_CODEC_POINTS = new Map([
  ["av1", 14],
  ["hevc", 13],
  ["h265", 13],
  ["x265", 13],
  ["h264", 10],
  ["x264", 10],
  ["vc1", 6],
  ["mpeg4", 5],
  ["mpeg2video", 4],
  ["mpeg2", 4]
]);

const AUDIO_CODEC_POINTS = new Map([
  ["truehd", 10],
  ["dts-hd ma", 10],
  ["dca-ma", 10],
  ["flac", 9],
  ["dts", 7],
  ["dca", 7],
  ["eac3", 7],
  ["ac3", 6],
  ["aac", 5],
  ["opus", 5],
  ["mp3", 3]
]);

function lower(value) {
  return String(value || "").toLowerCase();
}

function normalizedToken(value) {
  const token = lower(value).trim().replace(/^\./, "");
  if (["h265", "x265"].includes(token)) return "hevc";
  if (token === "x264") return "h264";
  // Plex reports DTS audio with ffmpeg's "dca" codec name.
  if (token === "dca") return "dts";
  return token;
}

function normalizedList(value) {
  return Array.isArray(value)
    ? value.map(normalizedToken).filter(Boolean)
    : [];
}

function matchesToken(preference, values) {
  return values.some((value) => value === preference || value.includes(preference));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

const RESOLUTION_HEIGHTS = new Map([
  ["8k", 4320],
  ["4k", 2160],
  ["2160", 2160],
  ["1440", 1440],
  ["1080", 1080],
  ["720", 720],
  ["576", 576],
  ["480", 480],
  ["sd", 480]
]);

// Widescreen encodes are letterboxed (1920x800 is still 1080p), so judge the
// resolution class by width as well as height and by Plex's own label.
export function effectiveHeight(record) {
  const height = number(record.height || record.video?.height);
  const width = number(record.width || record.video?.width);
  const labelHeight =
    RESOLUTION_HEIGHTS.get(lower(record.videoResolution).replace(/p$/, "")) || 0;
  return Math.max(height, Math.round((width * 9) / 16), labelHeight);
}

function resolutionPoints(height) {
  if (height >= 2160) return 36;
  if (height >= 1440) return 32;
  if (height >= 1080) return 27;
  if (height >= 720) return 19;
  if (height >= 576) return 13;
  if (height >= 480) return 10;
  return 6;
}

function bitratePoints(kbps) {
  if (!kbps) return 0;
  return clamp(Math.round(Math.log10(kbps) * 7) - 12, 0, 18);
}

function videoCodecPoints(codec) {
  const key = lower(codec);
  return VIDEO_CODEC_POINTS.get(key) ?? 4;
}

function audioCodecPoints(codec, profile = "") {
  const key = lower(codec);
  const audioProfile = lower(profile);
  if (["dca", "dts"].includes(key)) {
    // Plex exposes DTS-HD MA / DTS:X as codec "dca" with profile "ma" / "x".
    if (/(^|[^a-z])(ma|x)([^a-z]|$)/.test(audioProfile)) return 10;
    if (/(^|[^a-z])hra([^a-z]|$)/.test(audioProfile)) return 8;
  }
  return AUDIO_CODEC_POINTS.get(key) ?? 3;
}

function containerPoints(container) {
  const key = lower(container);
  if (["mkv", "mp4", "m4v"].includes(key)) return 4;
  if (["avi", "mov"].includes(key)) return 2;
  return 1;
}

function hasHdrSignal(record) {
  const haystack = [
    record.video?.dynamicRange,
    record.video?.colorSpace,
    record.video?.colorTrc,
    record.video?.displayTitle,
    record.video?.extendedDisplayTitle,
    record.video?.profile
  ]
    .map(lower)
    .join(" ");

  return (
    haystack.includes("hdr") ||
    haystack.includes("dolby vision") ||
    haystack.includes("dovi") ||
    haystack.includes("bt2020") ||
    haystack.includes("smpte2084")
  );
}

function preferenceMatches(record, preferences = {}) {
  const containers = normalizedList(preferences.containers);
  const videoCodecs = normalizedList(preferences.videoCodecs);
  const audioCodecs = normalizedList(preferences.audioCodecs);
  const bestAudio = record.audioStreams?.[0] || {};
  const recordContainers = [
    record.container,
    record.extension,
    String(record.file || "").split(".").pop()
  ].map(normalizedToken);
  const recordVideoCodecs = [
    record.videoCodec,
    record.video?.codec,
    record.video?.displayTitle,
    record.video?.extendedDisplayTitle
  ].map(normalizedToken);
  const recordAudioCodecs = [
    record.audioCodec,
    bestAudio.codec,
    ...(record.audioStreams || []).map((stream) => stream.codec)
  ].map(normalizedToken);

  const matches = [];
  const container = containers.find((item) => recordContainers.includes(item));
  if (container) matches.push(`Preferred ${container.toUpperCase()}`);

  const videoCodec = videoCodecs.find((item) => matchesToken(item, recordVideoCodecs));
  if (videoCodec) matches.push(`Preferred ${videoCodec.toUpperCase()}`);

  const audioCodec = audioCodecs.find((item) => matchesToken(item, recordAudioCodecs));
  if (audioCodec) matches.push(`Preferred ${audioCodec.toUpperCase()}`);

  return matches;
}

export function scoreMedia(record, preferences = {}) {
  const height = number(record.height || record.video?.height);
  const width = number(record.width || record.video?.width);
  const resolutionHeight = effectiveHeight(record);
  const bitrate = number(record.bitrate || record.video?.bitrate);
  const videoCodec = record.videoCodec || record.video?.codec;
  const bestAudio = record.audioStreams?.[0] || {};
  const audioCodec = record.audioCodec || bestAudio.codec;
  const channels = number(record.audioChannels || bestAudio.channels);
  const container = record.container || record.extension;
  const sizeBytes = number(record.size);
  const exists = record.exists !== false;

  const reasons = [];
  let score = 0;

  const res = resolutionPoints(resolutionHeight);
  score += res;
  reasons.push(`${width || "?"}x${height || "?"}`);

  const vCodec = videoCodecPoints(videoCodec);
  score += vCodec;
  if (videoCodec) reasons.push(String(videoCodec).toUpperCase());

  const bit = bitratePoints(bitrate);
  score += bit;
  if (bitrate) reasons.push(`${Math.round(bitrate / 100) / 10} Mbps`);

  if (hasHdrSignal(record)) {
    score += 6;
    reasons.push("HDR");
  }

  const audio = audioCodecPoints(audioCodec, record.audioProfile || bestAudio.profile);
  score += audio;
  if (audioCodec) reasons.push(String(audioCodec).toUpperCase());

  const channelScore = clamp(Math.round(channels * 1.5), 0, 10);
  score += channelScore;
  if (channels) reasons.push(`${channels} ch`);

  score += containerPoints(container);
  if (container) reasons.push(String(container).toUpperCase());

  if (sizeBytes) {
    score += clamp(Math.round(sizeBytes / 1024 / 1024 / 1024), 0, 6);
  }

  if (!exists) {
    score -= 18;
    reasons.push("missing");
  }

  const preferenceReasons = preferenceMatches(record, preferences);
  reasons.push(...preferenceReasons);
  const qualityValue = clamp(Math.round(score));
  const preferenceValue = preferenceReasons.length;

  return {
    value: qualityValue,
    preferenceValue,
    preferenceRank: preferenceValue * 1000 + qualityValue,
    preferenceReasons,
    reasons
  };
}
