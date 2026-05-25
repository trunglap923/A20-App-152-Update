import os

def generate_large_pdf(filename, size_mb):
    path = os.path.join(os.getcwd(), filename)
    print(f"Creating {filename} with size ~{size_mb}MB...")
    
    # PDF Header
    with open(path, "wb") as f:
        f.write(b"%PDF-1.4\n")
        f.write(b"%")
        f.write(os.urandom(1024 * 1024 * size_mb)) # Write random bytes to reach size
        f.write(b"\n%%EOF")
        
    print(f"Done! File created at: {path}")
    print(f"Actual size: {os.path.getsize(path) / (1024*1024):.2f} MB")

if __name__ == "__main__":
    generate_large_pdf("test_large_file.pdf", 16)
