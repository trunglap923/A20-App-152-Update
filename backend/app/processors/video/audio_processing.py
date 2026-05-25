from app.processors.base import BaseProcessor
import os
import subprocess
import uuid
import time

class AudioVideoProcessor(BaseProcessor):
    def __init__(self, upload_dir: str):
        self.upload_dir = upload_dir

    async def process(self, video_path: str, **kwargs) -> dict:
        """Trích xuất audio từ video dưới dạng MP3 nhẹ để gửi API."""
        mp3_path = self.convert_to_mp3(video_path)
        return {"audio_path": mp3_path}

    def convert_to_mp3(self, input_path: str, output_path: str = None) -> str:
        """Convert bất kỳ file audio/video sang MP3 64kbps 16kHz mono (tối ưu cho Whisper)."""
        if output_path is None:
            output_path = os.path.join(self.upload_dir, f"{uuid.uuid4()}.mp3")

        filename = input_path.split('/')[-1].split('?')[0] if input_path.startswith('http') else os.path.basename(input_path)
        print(f"[FFMPEG] Bắt đầu convert '{filename}' -> MP3 (16kHz mono 64kbps)...")
        t0 = time.time()

        command = [
            "ffmpeg", "-i", input_path,
            "-vn", "-ar", "16000", "-ac", "1", "-ab", "64k", "-y",
            output_path
        ]
        subprocess.run(command, check=True, capture_output=True)

        lat = time.time() - t0
        size_mb = os.path.getsize(output_path) / (1024 * 1024) if os.path.exists(output_path) else 0
        print(f"[FFMPEG] HOÀN TẤT convert MP3 (Latency: {lat:.2f}s | Size: {size_mb:.2f}MB)")
        return output_path

    def get_duration(self, filepath: str) -> float:
        """Đo chính xác độ dài file audio/video bằng ffprobe (tránh lệch timestamp khi ghép chunk)."""
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "default=noprint_wrappers=1:nokey=1", filepath],
                capture_output=True, text=True, check=True
            )
            return float(result.stdout.strip())
        except Exception:
            return 180.0  # Fallback 3 phút

    def get_mean_volume(self, filepath: str) -> float:
        """Đo âm lượng trung bình (dB) để phát hiện đoạn im lặng."""
        try:
            # Dùng filter volumedetect của ffmpeg
            command = [
                "ffmpeg", "-i", filepath,
                "-af", "volumedetect",
                "-f", "null", "NUL" if os.name == 'nt' else "/dev/null"
            ]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            output = result.stderr
            
            # Tìm dòng 'mean_volume: -XX.X dB'
            import re
            match = re.search(r"mean_volume:\s+(-?\d+\.?\d*)\s+dB", output)
            if match:
                return float(match.group(1))
            return -100.0
        except Exception as e:
            print(f"[FFMPEG] Lỗi đo volume: {e}")
            return 0.0 # Mặc định coi như có tiếng nếu lỗi

    def merge_audio_chunks(self, chunk_paths: list, output_path: str) -> str:
        """Ghép và convert nhiều file WebM thành 1 file MP3 hoàn chỉnh (fix duration)."""
        if not chunk_paths:
            return ""
            
        print(f"[FFMPEG] Đang ghép {len(chunk_paths)} chunks thành file MP3...")
        t0 = time.time()
        
        # Tạo file danh sách cho ffmpeg concat
        list_path = os.path.join(self.upload_dir, f"concat_list_{uuid.uuid4().hex}.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in chunk_paths:
                # Đảm bảo dùng path tuyệt đối và escape dấu nháy đơn
                abs_p = os.path.abspath(p).replace("'", "'\\''")
                f.write(f"file '{abs_p}'\n")
        
        try:
            # Lưu ý: Chúng ta convert sang MP3 luôn để FIX lỗi Duration/Seekable
            command = [
                "ffmpeg", "-f", "concat", "-safe", "0",
                "-i", list_path,
                "-ar", "16000", "-ac", "1", "-ab", "64k", # Chuẩn Whisper
                output_path, "-y"
            ]
            subprocess.run(command, check=True, capture_output=True)
            
            lat = time.time() - t0
            size_mb = os.path.getsize(output_path) / (1024 * 1024) if os.path.exists(output_path) else 0
            print(f"[FFMPEG] HOÀN TẤT ghép & convert MP3 (Latency: {lat:.2f}s | Size: {size_mb:.2f}MB)")
            return output_path
        finally:
            if os.path.exists(list_path):
                os.remove(list_path)

    def extract_frames(self, video_path: str, timestamps: list) -> list:
        """Trích xuất frames tại các mốc thời gian cụ thể."""
        frame_paths = []
        t0 = time.time()
        print(f"[FFMPEG] Đang trích xuất {len(timestamps)} frames tại timestamps: {[f'{t:.1f}s' for t in timestamps]}")
        for ts in timestamps:
            frame_filename = f"{uuid.uuid4()}_frame_{ts}.jpg"
            frame_path = os.path.join(self.upload_dir, frame_filename)
            
            command = [
                "ffmpeg", "-ss", str(ts),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                frame_path, "-y"
            ]
            try:
                subprocess.run(command, check=True, capture_output=True)
                frame_paths.append(frame_path)
            except Exception as e:
                print(f"⚠ Warning: Không thể trích xuất frame tại {ts}s: {e}")
        
        lat = time.time() - t0
        print(f"[FFMPEG] HOÀN TẤT trích xuất frames ({len(frame_paths)}/{len(timestamps)} frame, Latency: {lat:.2f}s)")
        return frame_paths

    def extract_scene_frames(self, video_path: str, start_ts: float, duration: float, max_frames: int = 3) -> list:
        """Trích xuất keyframe dựa trên scene detection (sự thay đổi cảnh)."""
        import glob
        t0 = time.time()
        print(f"[FFMPEG] Đang trích xuất keyframes (Scene Detection) từ {start_ts:.1f}s, thời lượng {duration:.1f}s...")
        
        out_prefix = os.path.join(self.upload_dir, f"{uuid.uuid4().hex[:8]}_scene_")
        out_pattern = f"{out_prefix}%03d.jpg"
        
        command = [
            "ffmpeg", "-ss", str(start_ts), "-t", str(duration),
            "-i", video_path,
            "-vf", "select='gt(scene,0.4)'",
            "-vsync", "2",
            "-q:v", "2",
            "-strict", "-2",
            out_pattern, "-y"
        ]
        
        try:
            subprocess.run(command, check=True, capture_output=True)
        except Exception as e:
            print(f"⚠ Warning: Lỗi khi trích xuất keyframe (scene): {e}")
            
        pattern = f"{out_prefix}*.jpg"
        found_files = sorted(glob.glob(pattern))
        
        if len(found_files) > max_frames:
            step = len(found_files) / max_frames
            selected_files = [found_files[int(i * step)] for i in range(max_frames)]
            for f in found_files:
                if f not in selected_files:
                    try:
                        os.remove(f)
                    except:
                        pass
            found_files = selected_files

        if not found_files:
            mid_ts = start_ts + duration / 2
            print(f"[FFMPEG] Không có chuyển cảnh nổi bật, fallback lấy 1 frame tại {mid_ts:.1f}s")
            return self.extract_frames(video_path, [mid_ts])

        lat = time.time() - t0
        print(f"[FFMPEG] HOÀN TẤT trích xuất {len(found_files)} keyframes (Latency: {lat:.2f}s)")
        return found_files