import sys, glob
from PIL import Image
files = sys.argv[2:]; out = sys.argv[1]
ims = [Image.open(f) for f in files]
cols = 4; w = max(i.width for i in ims); h = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
can = Image.new("RGB", (cols * w, rows * h), "white")
for k, im in enumerate(ims): can.paste(im, ((k % cols) * w, (k // cols) * h))
can.save(out); print(can.size)
