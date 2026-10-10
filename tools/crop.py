import sys
from PIL import Image
src, out, top, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
im.crop((0, top, im.width, min(im.height, top + h))).save(out)
print(im.size)
