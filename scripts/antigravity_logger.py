import sys
import json
import os
from datetime import datetime, timezone, timedelta
import subprocess
from pathlib import Path

VN_TZ = timezone(timedelta(hours=7))

def git(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""

if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""
    session_id = sys.argv[2] if len(sys.argv) > 2 else ""
    model_name = sys.argv[3] if len(sys.argv) > 3 else "antigravity"
    tool_name = ""
    tool_args = ""
    
    ts = datetime.now(VN_TZ).isoformat()
    
    entry = {
        "ts": ts,
        "tool": "antigravity",
        "event": "PromptSubmit",
        "session_id": session_id,
        "model": model_name,
        "repo": git("git remote get-url origin").split("/")[-1].replace(".git", ""),
        "branch": git("git rev-parse --abbrev-ref HEAD"),
        "commit": git("git rev-parse --short HEAD"),
        "student": git("git config user.email"),
        "prompt": prompt[:200],
        "tool_name": tool_name,
        "tool_args": tool_args
    }
    
    log_dir = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "session.jsonl"
    
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
