import sys, pypdfium2 as pdfium, os
src = sys.argv[1]; out = sys.argv[2]
for i in (1,2,3):
    pdf = pdfium.PdfDocument(os.path.join(src, f"Lec {i} (Anions).pdf"))
    print(i, len(pdf), pdf[0].get_size())
    for n in range(len(pdf)):
        page = pdf[n]
        w, h = page.get_size()
        scale = 1100 / w
        img = page.render(scale=scale).to_pil()
        img.save(os.path.join(out, f"L0{i}_s{n+1:02d}.png"))
