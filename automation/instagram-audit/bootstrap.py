"""Deploy this isolated worker on the dedicated Railway cloud agent VM."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
data = root / "data"
data.mkdir(exist_ok=True, mode=0o700)
credentials = root / ".env"
with os.fdopen(os.open(credentials, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as output:
    for name in ("AI_AGENT_KEY", "AI_GATEWAY_URL", "AI_AGENT_MODEL"):
        value = os.environ.get(name, "")
        if "\n" in value or "\r" in value:
            raise ValueError(f"Invalid multiline {name}")
        if value:
            output.write(f"{name}={value}\n")

subprocess.run(["docker", "build", "-t", "lastberth-instagram-audit:local", str(root)], check=True)
subprocess.run([
    "docker", "run", "-d", "--name", "lastberth-instagram-audit",
    "--restart", "unless-stopped", "--network", "host", "--init", "--shm-size", "1g",
    "--log-opt", "max-size=10m", "--log-opt", "max-file=3",
    "--env-file", str(credentials), "-e", "TZ=Europe/London",
    "-v", f"{data}:/data",
    "-v", "/usr/local/bin/railway-agent:/usr/local/bin/railway-agent:ro",
    "lastberth-instagram-audit:local",
], check=True)
print("Worker container started. Verify http://127.0.0.1:3098/health.")
