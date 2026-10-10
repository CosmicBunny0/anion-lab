# sheet.py out.png top height scale f1 f2 f3 ... : crop each full-page shot [top, top+height] and put side by side
import sys
from PIL import Image
out, top, height, scale = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
ims = []
for f in sys.argv[5:]:
    im = Image.open(f); im = im.crop((0, top, im.width, min(im.height, top + height)))
    ims.append(im.resize((int(im.width * scale), int(im.height * scale))))
W = sum(i.width for i in ims) + 10 * (len(ims) - 1); H = max(i.height for i in ims)
can = Image.new("RGB", (W, H), (255, 0, 255)); x = 0
for im in ims: can.paste(im, (x, 0)); x += im.width + 10
can.save(out); print(out, can.size)
