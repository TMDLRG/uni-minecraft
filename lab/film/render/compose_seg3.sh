#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

TTS=(
 tts_0c936f89 tts_93b6dfb2 tts_7cfb579d tts_673024fd tts_ff1cdb31 tts_1723051e tts_b53b0db7 tts_ec131c98 tts_d8710eb8
 tts_6b4274db tts_4caaa22d tts_b97f3f3e tts_3bb0e51e tts_3f299038 tts_e0a6aae3 tts_23440324 tts_34c1d2f9
 tts_b04321c7 tts_ecff17ea tts_26146417 tts_af13a9d5 tts_92356eec tts_48305d52 tts_22b5795b tts_25d2ec7b tts_4a4b4b69
 tts_d0483cd1 tts_dab81c41 tts_c73fe27f tts_afa701e6 tts_dc371ddd tts_e05ce3b8 tts_06782a11 tts_fd7f4313 tts_475d8d93
)

rm -f audio/seg3_[0-9]*.wav output/seg3_sc*.mp4 output/seg3_concat.txt
: > output/seg3_concat.txt

n=${#TTS[@]}
for i in $(seq 0 $((n-1))); do
  idx=$((i+1)); num=$(printf "%02d" "$idx")
  docker cp "orchestrate-api:/app/audio/${TTS[$i]}.wav" "audio/seg3_${num}.wav" >/dev/null 2>&1
  img=$(ls frames/seg3_${num}_*.png 2>/dev/null | head -1)
  [ -z "$img" ] && { echo "MISSING frame for scene $num"; exit 1; }
  out="output/seg3_sc${num}.mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate 30 -i "$img" -i "audio/seg3_${num}.wav" \
    -filter_complex "[1:a]aresample=48000,adelay=700|700,apad=pad_dur=3.2,alimiter=limit=0.85[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -tune stillimage -preset medium -crf 19 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 48000 -shortest "$out"
  echo "file 'seg3_sc${num}.mp4'" >> output/seg3_concat.txt
done

echo "=== concat ==="
( cd output && ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i seg3_concat.txt -c copy segment_03_en_mrcap.mp4 )
echo "=== final probe ==="
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 output/segment_03_en_mrcap.mp4
