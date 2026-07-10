import test from "node:test";
import assert from "node:assert/strict";
import { scoreMedia } from "../src/scoring.js";

test("scores higher-quality video above lower-quality video", () => {
  const low = scoreMedia({
    height: 720,
    width: 1280,
    bitrate: 2500,
    videoCodec: "h264",
    audioCodec: "aac",
    audioChannels: 2,
    container: "mp4",
    size: 1_500_000_000
  });

  const high = scoreMedia({
    height: 2160,
    width: 3840,
    bitrate: 18000,
    videoCodec: "hevc",
    video: { colorSpace: "bt2020", colorTrc: "smpte2084" },
    audioCodec: "truehd",
    audioChannels: 8,
    container: "mkv",
    size: 25_000_000_000
  });

  assert.ok(high.value > low.value);
});

test("keep preferences outrank raw quality for recommendations", () => {
  const preferredContainer = scoreMedia(
    {
      height: 720,
      width: 1280,
      bitrate: 2500,
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
      container: "mkv",
      extension: "mkv",
      size: 1_500_000_000
    },
    { containers: ["mkv"] }
  );

  const rawQuality = scoreMedia(
    {
      height: 2160,
      width: 3840,
      bitrate: 18000,
      videoCodec: "hevc",
      audioCodec: "truehd",
      audioChannels: 8,
      container: "mp4",
      extension: "mp4",
      size: 25_000_000_000
    },
    { containers: ["mkv"] }
  );

  assert.ok(rawQuality.value > preferredContainer.value);
  assert.ok(preferredContainer.preferenceRank > rawQuality.preferenceRank);
  assert.deepEqual(preferredContainer.preferenceReasons, ["Preferred MKV"]);
});

test("video codec keep preferences match common x265 aliases", () => {
  const scored = scoreMedia(
    {
      height: 1080,
      width: 1920,
      videoCodec: "hevc",
      audioCodec: "aac",
      audioChannels: 2,
      container: "mp4"
    },
    { videoCodecs: ["x265"] }
  );

  assert.deepEqual(scored.preferenceReasons, ["Preferred HEVC"]);
});
