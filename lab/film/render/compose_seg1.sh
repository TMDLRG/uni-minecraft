#!/usr/bin/env bash
# Retrieve narration WAVs from the container, compose each scene (image + padded audio),
# and concatenate into the full Segment 1 MP4. Uses local ffmpeg.
set -e
cd "$(dirname "$0")/.."

# tts container ids in exact scene order (1..40)
TTS=(
 tts_e3b3db5e tts_deabcdde tts_10b0d60c tts_85992240 tts_edf5f3c0 tts_8e361014 tts_af2347eb tts_94e9b76c
 tts_941c44d6 tts_9ead3da5 tts_a20c3b0f tts_c54bff0d tts_7f228289 tts_23905f0f tts_88f86c80 tts_1eb75b72
 tts_f2ce9d57 tts_424acce9 tts_52507156 tts_152e1cfc tts_0b5ccdcd tts_64fce9c5 tts_41c4c2a2 tts_93aaead6
 tts_068aa2c4 tts_695d2f33 tts_19d5602e tts_1956b2af tts_711efc12 tts_a641cc8f tts_f3238e6c tts_865706e9
 tts_03ffdd18 tts_106cacd9 tts_531e65d7 tts_378e2c9a tts_9da1a995 tts_f40500bf tts_e3d40e25 tts_da4ca67a
)

rm -f audio/seg1_[0-9]*.wav output/seg1_sc*.mp4 output/seg1_concat.txt
: > output/seg1_concat.txt

n=${#TTS[@]}
for i in $(seq 0 $((n-1))); do
  idx=$((i+1)); num=$(printf "%02d" "$idx")
  docker cp "orchestrate-api:/app/audio/${TTS[$i]}.wav" "audio/seg1_${num}.wav" >/dev/null 2>&1
  img=$(ls frames/seg1_${num}_*.png 2>/dev/null | head -1)
  [ -z "$img" ] && { echo "MISSING frame for scene $num"; exit 1; }
  out="output/seg1_sc${num}.mp4"
  # 0.7s lead-in silence, narration, 3.2s lead-out hold -> contemplative documentary pacing.
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate 30 -i "$img" -i "audio/seg1_${num}.wav" \
    -filter_complex "[1:a]aresample=48000,adelay=700|700,apad=pad_dur=3.2,alimiter=limit=0.95[a]" \
    -map 0:v -map "[a]" \
    -c:v libx264 -tune stillimage -preset medium -crf 19 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -ar 48000 -shortest "$out"
  echo "file 'seg1_sc${num}.mp4'" >> output/seg1_concat.txt
  d=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
  printf "  sc%s  %ss\n" "$num" "$d"
done

echo "=== concat ==="
( cd output && ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i seg1_concat.txt -c copy segment_01_en_mrcap.mp4 )
echo "=== final probe ==="
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 output/segment_01_en_mrcap.mp4
