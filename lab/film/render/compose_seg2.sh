#!/usr/bin/env bash
# Compose Segment 2: THE SKY'S SHIELD
set -e
cd "$(dirname "$0")/.."

TTS=(
 tts_d581d893 tts_058a39a4 tts_de0e8772 tts_8a2a2db0 tts_2fa57909 tts_faa9511d tts_9b394a12 tts_bd9be005
 tts_8cd6a070 tts_72708078 tts_333933fc tts_67c1d6bc tts_ca21f915 tts_4c620b42 tts_17ea6723 tts_61408e3d
 tts_abad7766 tts_6233d586 tts_4a711392 tts_426b0a38 tts_efc329a0 tts_9acca2e3 tts_13b3c6ae tts_40643594
 tts_230a83f1 tts_af47efa1 tts_9e502c50 tts_259ffab9 tts_0bdedf9d tts_3f692cf5 tts_06082ab0 tts_6d4525b8
 tts_a7b7e2e2 tts_b257fc07 tts_8c7ac342 tts_9b97a28f
)

rm -f audio/seg2_[0-9]*.wav output/seg2_sc*.mp4 output/seg2_concat.txt
: > output/seg2_concat.txt

n=${#TTS[@]}
for i in $(seq 0 $((n-1))); do
  idx=$((i+1)); num=$(printf "%02d" "$idx")
  docker cp "orchestrate-api:/app/audio/${TTS[$i]}.wav" "audio/seg2_${num}.wav" >/dev/null 2>&1
  img=$(ls frames/seg2_${num}_*.png 2>/dev/null | head -1)
  [ -z "$img" ] && { echo "MISSING frame for scene $num"; exit 1; }
  out="output/seg2_sc${num}.mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate 30 -i "$img" -i "audio/seg2_${num}.wav" \
    -filter_complex "[1:a]aresample=48000,adelay=700|700,apad=pad_dur=3.2,alimiter=limit=0.85[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -tune stillimage -preset medium -crf 19 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 48000 -shortest "$out"
  echo "file 'seg2_sc${num}.mp4'" >> output/seg2_concat.txt
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
  printf "  sc%s  %ss\n" "$num" "$d"
done

echo "=== concat ==="
( cd output && ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i seg2_concat.txt -c copy segment_02_en_mrcap.mp4 )
echo "=== final probe ==="
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 output/segment_02_en_mrcap.mp4
