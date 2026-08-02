#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

TTS=(
 tts_8439dc2d tts_afc84ead tts_2d98079e tts_4ff2584f tts_2cbc8a5a tts_83595306 tts_9dbc0492 tts_bcea9922 tts_6d8f11f6
 tts_6398042b tts_18f0bfca tts_382a602c tts_5089b54a tts_4790af8e tts_acff18e1 tts_40504012 tts_cea294ec
 tts_e6f29bc3 tts_8f52e1f8 tts_6ed230ac tts_5889ac53 tts_b683dc65 tts_45d772a2 tts_cc692220 tts_69fdc167 tts_74a1a434
)

rm -f audio/seg4_[0-9]*.wav output/seg4_sc*.mp4 output/seg4_concat.txt
: > output/seg4_concat.txt
n=${#TTS[@]}
for i in $(seq 0 $((n-1))); do
  idx=$((i+1)); num=$(printf "%02d" "$idx")
  docker cp "orchestrate-api:/app/audio/${TTS[$i]}.wav" "audio/seg4_${num}.wav" >/dev/null 2>&1
  img=$(ls frames/seg4_${num}_*.png 2>/dev/null | head -1)
  [ -z "$img" ] && { echo "MISSING frame for scene $num"; exit 1; }
  out="output/seg4_sc${num}.mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate 30 -i "$img" -i "audio/seg4_${num}.wav" \
    -filter_complex "[1:a]aresample=48000,adelay=700|700,apad=pad_dur=3.2,alimiter=limit=0.85[a]" \
    -map 0:v -map "[a]" -c:v libx264 -tune stillimage -preset medium -crf 19 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 48000 -shortest "$out"
  echo "file 'seg4_sc${num}.mp4'" >> output/seg4_concat.txt
done
( cd output && ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i seg4_concat.txt -c copy segment_04_en_mrcap.mp4 )
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 output/segment_04_en_mrcap.mp4
