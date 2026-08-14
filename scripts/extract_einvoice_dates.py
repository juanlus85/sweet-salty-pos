from bs4 import BeautifulSoup

html_path = "/tmp/rd238.html"
text = BeautifulSoup(open(html_path, encoding="utf-8"), "html.parser").get_text(" ", strip=True)
needles = [
    "Disposición final cuarta",
    "disposición final octava",
    "Disposición transitoria primera",
    "Disposición transitoria segunda",
    "Disposición transitoria tercera",
    "entrada en vigor",
    "ocho millones",
    "doce meses",
    "veinticuatro meses",
]
for needle in needles:
    print(f"\n### {needle}")
    start = 0
    found = 0
    while True:
        pos = text.lower().find(needle.lower(), start)
        if pos < 0 or found >= 3:
            break
        print(text[max(0, pos - 250):pos + 1100])
        start = pos + len(needle)
        found += 1
