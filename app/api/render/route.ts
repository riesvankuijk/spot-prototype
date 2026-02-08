import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const runtime = "nodejs";
export const maxDuration = 60;

function runCmd(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${cmd} exited with ${code}`));
    });
  });
}

async function getAudioDurationSeconds(ffprobePath: string, filePath: string): Promise<number> {
  const { stdout } = await runCmd(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const dur = Number(stdout.trim());
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error(`Could not read duration via ffprobe: "${stdout.trim()}"`);
  }
  return dur;
}

export async function POST(req: Request) {
  try {
    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return new NextResponse("No text provided", { status: 400 });
    }
    if (!voiceId) {
      return new NextResponse("No voiceId provided", { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return new NextResponse("Missing ELEVENLABS_API_KEY", { status: 500 });

    const bgmFile = path.join(process.cwd(), "public/audio/bgm.mp3");
    try {
      await fs.access(bgmFile);
    } catch {
      return new NextResponse("Missing public/audio/bgm.mp3", { status: 500 });
    }

    // Timing zoals jij wil
    const pre = 1.5;
    const post = 1.5;

    // Volumes
    const bgmPrePostVol = 0.40;
    const bgmDuringVol = 0.30;
    const voiceVol = 1.20;

    // ElevenLabs sneller
    const ttsUrl =
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` +
      `?optimize_streaming_latency=4&output_format=mp3_44100_128`;

    const ttsRes = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.85,
          style: 0.6,
          use_speaker_boost: true,
        },
      }),
    });

    if (!ttsRes.ok) {
      const msg = await ttsRes.text();
      return new NextResponse(msg || "TTS failed", { status: 500 });
    }

    const ttsBuffer = Buffer.from(await ttsRes.arrayBuffer());

    const tmpDir = "/tmp";
    const ttsFile = path.join(tmpDir, `tts-${Date.now()}.mp3`);
    const outFile = path.join(tmpDir, `spot-${Date.now()}.mp3`);
    await fs.writeFile(ttsFile, ttsBuffer);

    // Vercel-proof binary paths
    const ffmpegPath = (ffmpegStatic as string) || "ffmpeg";
    const ffprobePath = (ffprobeStatic as string) || "ffprobe";

    // Echte voice duur → jouw timing terug
    const voiceDurRaw = await getAudioDurationSeconds(ffprobePath, ttsFile);

    // Max 25s zoals je eerder had
    let total = pre + voiceDurRaw + post;
    if (total > 25) total = 25;

    const maxVoice = Math.max(0.1, total - pre - post);

    // Mix + fade
    await runCmd(ffmpegPath, [
      "-y",
      "-i",
      ttsFile,
      "-stream_loop",
      "-1",
      "-i",
      bgmFile,
      "-filter_complex",
      `[0:a]atrim=0:${maxVoice.toFixed(3)},asetpts=N/SR/TB,volume=${voiceVol}[v];` +
        `[v]adelay=${Math.round(pre * 1000)}|${Math.round(pre * 1000)}[vdel];` +
        `[1:a]atrim=0:${pre.toFixed(3)},asetpts=N/SR/TB,volume=${bgmPrePostVol}[bpre];` +
        `[1:a]atrim=${pre.toFixed(3)}:${(pre + maxVoice).toFixed(3)},asetpts=N/SR/TB,volume=${bgmDuringVol}[bdur];` +
        `[1:a]atrim=${(pre + maxVoice).toFixed(3)}:${(pre + maxVoice + post).toFixed(3)},asetpts=N/SR/TB,volume=${bgmPrePostVol}[bpost];` +
        `[bpre][bdur][bpost]concat=n=3:v=0:a=1[bgmfull];` +
        `[bgmfull][vdel]amix=inputs=2:duration=first:dropout_transition=0[m];` +
        `[m]afade=t=out:st=${Math.max(0, total - post).toFixed(3)}:d=${post.toFixed(3)}[out]`,
      "-map",
      "[out]",
      "-t",
      total.toFixed(3),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outFile,
    ]);

    const outBuffer = await fs.readFile(outFile);

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="spot.mp3"',
      },
    });
  } catch (err: any) {
    console.error("Render error:", err);
    return new NextResponse(err?.message || "Server error", { status: 500 });
  }
}
