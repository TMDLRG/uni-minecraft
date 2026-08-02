#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

TTS=(
 tts_fdffba4a tts_1314cd18 tts_b1364592 tts_7fcf6398 tts_5d277609 tts_e4fa70bc tts_df3ef3ac tts_269e6383 tts_8dba3803 tts_f6d09204
 tts_c048c0d3 tts_dbccc47a tts_d29dbabf tts_ddd79485 tts_6952798f tts_ef618a8a tts_0c51721f tts_456f0a4b tts_1dbf2fce tts_27e3c528
)

rm -f audio/seg5_[0-9]*.wav output/seg5_sc*.mp4 output/seg5_concat.txt
: > output/seg5_concat.txt
n=${#TTS[@]}
for i in $(seq 0 $((n-1))); do
  idx=$((i+1)); num=$(printf "%02d" "$idx")
  docker cp "orchestrate-api:/app/audio/${TTS[$i]}.wav" "audio/seg5_${num}.wav" >/dev/null 2>&1
  img=$(ls frames/seg5_${num}_*.png 2>/dev/null | head -1)
  [ -z "$img" ] && { echo "MISSING frame for scene $num"; exit 1; }
  out="output/seg5_sc${num}.mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate 30 -i "$img" -i "audio/seg5_${num}.wav" \
    -filter_complex "[1:a]aresample=48000,adelay=700|700,apad=pad_dur=3.2,alimiter=limit=0.85[a]" \
    -map 0:v -map "[a]" -c:v libx264 -tune stillimage -preset medium -crf 19 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 48000 -shortest "$out"
  echo "file 'seg5_sc${num}.mp4'" >> output/seg5_concat.txt
done
( cd output && ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i seg5_concat.txt -c copy segment_05_en_mrcap.mp4 )
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 output/segment_05_en_mrcap.mp4
echo "=== FULL FILM (all 5 segments) ==="
cd output
{ echo "file 'segment_01_en_mrcap.mp4'"; echo "file 'segment_02_en_mrcap.mp4'"; echo "file 'segment_03_en_mrcap.mp4'"; echo "file 'segment_04_en_mrcap.mp4'"; echo "file 'segment_05_en_mrcap.mp4'"; } > _film_concat.txt
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i _film_concat.txt -c copy TRAVELERS_FULL_FILM.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 TRAVELERS_FULL_FILM.mp4
