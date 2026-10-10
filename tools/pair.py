import sys, os, glob
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
for lec in ("L01","L02","L03"):
    files = sorted(glob.glob(os.path.join(src, f"{lec}_s*.png")))
    for k in range(0, len(files), 2):
        ims = [Image.open(f) for f in files[k:k+2]]
        w = max(i.width for i in ims); h = sum(i.height for i in ims) + 8*(len(ims)-1)
        canvas = Image.new("RGB", (w, h), "black")
        y = 0
        for im in ims:
            canvas.paste(im, (0, y)); y += im.height + 8
        name = f"{lec}_{k+1:02d}-{k+len(ims):02d}.png"
        canvas.save(os.path.join(out, name))
