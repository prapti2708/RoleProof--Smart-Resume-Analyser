"""Generates the developer fixture PDFs and the "Try a sample" resume.

Run: python3 scripts/make_fixtures.py
Needs: reportlab, Pillow, fontTools (all pip-installable) and the DejaVu Sans font.
Outputs are committed, so you only need this when changing fixtures.
"""
import io
import os
import random

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as RLTTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "fixtures", "pdfs")
PUB = os.path.join(ROOT, "public", "samples")
os.makedirs(FIX, exist_ok=True)
os.makedirs(PUB, exist_ok=True)

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
DEJAVU_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
W, H = A4

# An icon font like Font Awesome: private-use code points mapped to real glyphs.
ICON_FONT = os.path.join("/tmp", "RoleProofIcons.ttf")
ICONS = {0xF0E0: 0x2709, 0xF095: 0x260E, 0xF09B: 0x2605, 0xF08C: 0x2726}
f = TTFont(DEJAVU)
for table in f["cmap"].tables:
    if table.isUnicode():
        for pua, real in ICONS.items():
            if real in table.cmap:
                table.cmap[pua] = table.cmap[real]
f["name"].setName("RoleProofIcons", 1, 3, 1, 0x409)
f["name"].setName("RoleProofIcons", 4, 3, 1, 0x409)
f.save(ICON_FONT)

pdfmetrics.registerFont(RLTTFont("DejaVu", DEJAVU))
pdfmetrics.registerFont(RLTTFont("DejaVuB", DEJAVU_B))
pdfmetrics.registerFont(RLTTFont("Icons", ICON_FONT))


def text_lines(c, x, y, lines, size=10, font="DejaVu", lead=14):
    for ln in lines:
        if ln.startswith("# "):
            c.setFont("DejaVuB", size + 1.5)
            c.drawString(x, y, ln[2:])
        else:
            c.setFont(font, size)
            c.drawString(x, y, ln)
        y -= lead
    return y


LEFT = [
    "# Skills",
    "Python, Java, SQL",
    "Docker, Kubernetes",
    "Git, Linux",
    "",
    "# Education",
    "B.Tech CSE, 2027",
    "CGPA 8.4",
    "",
    "# Certifications",
    "AWS Cloud Practitioner",
    "",
    "# Languages",
    "English, Hindi",
]
RIGHT = [
    "# Experience",
    "Backend Intern, Acme Labs (2025)",
    "Wrote REST APIs in Flask for an",
    "internal attendance dashboard.",
    "",
    "# Projects",
    "Placement Portal: built a placement",
    "portal using ReactJS and NodeJS",
    "with a PostgreSQL database.",
    "",
    "Chat App: real-time chat with",
    "WebSockets and Redis pub/sub.",
    "",
    "# Achievements",
    "Smart India Hackathon finalist",
]


def two_column():
    c = canvas.Canvas(os.path.join(FIX, "two_column.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 18)
    c.drawString(50, H - 60, "Asha Verma")
    c.setFont("DejaVu", 10)
    c.drawString(50, H - 78, "Final-year B.Tech student, Phagwara, Punjab")
    text_lines(c, 50, H - 120, LEFT)
    text_lines(c, 300, H - 120, RIGHT)
    c.save()


def table_skills():
    c = canvas.Canvas(os.path.join(FIX, "table_skills.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 16)
    c.drawString(50, H - 60, "Rohan Mehta")
    c.setFont("DejaVuB", 12)
    c.drawString(50, H - 95, "Technical Skills")
    data = [
        ["Category", "Skills"],
        ["Languages", "TypeScript, Python"],
        ["Frameworks", "Express.js, Django"],
        ["DevOps", "GitHub Actions, Docker"],
        ["Databases", "MongoDB, MySQL"],
    ]
    t = Table(data, colWidths=[120, 260])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "DejaVu", 10),
        ("FONT", (0, 0), (-1, 0), "DejaVuB", 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
    ]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, 50, H - 110 - th)
    text_lines(c, 50, H - 130 - th, [
        "# Projects",
        "Expense splitter for hostel groups with UPI deep links.",
        "Unit testing with Jest for the settlement algorithm.",
    ])
    c.save()


def icons():
    c = canvas.Canvas(os.path.join(FIX, "icons.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 16)
    c.drawString(50, H - 60, "Meera Iyer")
    y = H - 85
    for code, label in [(0xF0E0, "meera@example.com"), (0xF095, "+91 98765 43210"), (0xF09B, "github.com/meera")]:
        c.setFont("Icons", 10)
        c.drawString(50, y, chr(code))
        c.setFont("DejaVu", 10)
        c.drawString(66, y, label)
        y -= 15
    c.setFont("DejaVu", 10)
    c.drawString(50, y - 6, "★ ★ ★  Skills: Kotlin, Android, Firebase")
    c.drawString(50, y - 21, "\U0001F4BB Built an attendance app with Jetpack Compose and Room.")
    c.drawString(50, y - 36, "✦ Machine learning with scikit-learn and pandas")
    c.save()


def render_text_image(lines, width_px=1654, height_px=900, size=34, noise=False):
    img = Image.new("L", (width_px, height_px), 255)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(DEJAVU, size)
    bold = ImageFont.truetype(DEJAVU_B, size + 4)
    y = 40
    for ln in lines:
        if ln.startswith("# "):
            d.text((60, y), ln[2:], fill=0, font=bold)
            y += size + 22
        else:
            d.text((60, y), ln, fill=20, font=font)
            y += size + 16
    if noise:
        rnd = random.Random(7)
        for _ in range(4000):
            d.point((rnd.randrange(width_px), rnd.randrange(height_px)), fill=rnd.randrange(80, 200))
    return img


SCAN_LINES = [
    "# Karan Singh",
    "Computer Science student, Jalandhar",
    "# Skills",
    "Java, Spring Boot, MySQL, Docker",
    "# Projects",
    "Library seat finder built with Spring Boot",
    "and React. Deployed on AWS EC2.",
]


def draw_image(c, img, x, y, w):
    h = w * img.height / img.width
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    c.drawImage(ImageReader(buf), x, y - h, width=w, height=h)
    return h


def scanned():
    c = canvas.Canvas(os.path.join(FIX, "scanned.pdf"), pagesize=A4)
    img = render_text_image(SCAN_LINES, height_px=700, noise=True)
    draw_image(c, img, 0, H - 30, W)
    c.save()


def mixed_pages():
    c = canvas.Canvas(os.path.join(FIX, "mixed_pages.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 16)
    c.drawString(50, H - 60, "Neha Kapoor")
    text_lines(c, 50, H - 95, [
        "# Experience",
        "Data intern: cleaned survey data with pandas and NumPy.",
        "Built dashboards in Power BI for placement statistics.",
    ])
    c.showPage()
    img = render_text_image([
        "# Projects (scanned certificate page)",
        "Completed TensorFlow developer course.",
        "Trained an NLP model for Hinglish complaints.",
    ], height_px=400)
    draw_image(c, img, 0, H - 40, W)
    c.save()


def mixed_region():
    c = canvas.Canvas(os.path.join(FIX, "mixed_region.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 16)
    c.drawString(50, H - 60, "Vikram Rao")
    text_lines(c, 50, H - 90, ["Typed summary: Python developer who enjoys backend work.", "Skills: Python, FastAPI"])
    img = render_text_image(["# Scanned internship letter", "Worked on Terraform scripts and Ansible playbooks.", "Monitored services with Grafana dashboards."], height_px=330)
    draw_image(c, img, 30, H - 150, W - 60)
    c.save()


def unreadable():
    c = canvas.Canvas(os.path.join(FIX, "unreadable.pdf"), pagesize=A4)
    c.setFont("DejaVuB", 16)
    c.drawString(50, H - 60, "Priya Nair")
    text_lines(c, 50, H - 90, ["# Skills", "Python, SQL, Tableau, Excel", "# Projects", "Sales dashboard in Tableau for a college fest."])
    c.showPage()
    rnd = random.Random(3)
    img = Image.new("L", (800, 1100), 255)
    d = ImageDraw.Draw(img)
    for _ in range(60000):
        d.point((rnd.randrange(800), rnd.randrange(1100)), fill=rnd.randrange(0, 255))
    draw_image(c, img, 0, H, W)
    c.save()


def sample_resume():
    path = os.path.join(PUB, "sample-resume.pdf")
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("Sample resume - Ananya Sharma")
    c.setFont("DejaVuB", 20)
    c.drawString(50, H - 62, "Ananya Sharma")
    c.setFont("DejaVu", 10)
    c.drawString(50, H - 80, "B.Tech Computer Science (AI & Data Analytics), 2028")
    y = H - 98
    x = 50
    for code, label in [(0xF0E0, "ananya@example.com"), (0xF095, "+91 90000 12345"), (0xF09B, "github.com/ananya-dev")]:
        c.setFont("Icons", 9)
        c.drawString(x, y, chr(code))
        c.setFont("DejaVu", 9)
        c.drawString(x + 13, y, label)
        x += 165
    c.setStrokeColor(colors.HexColor("#999999"))
    c.line(50, H - 110, W - 50, H - 110)
    left = [
        "# Skills",
        "JavaScript, TypeScript",
        "Python, C++",
        "HTML, CSS, Tailwind",
        "Git, Linux",
        "",
        "# Education",
        "Lovely Professional University",
        "B.Tech CSE, CGPA 8.6",
        "",
        "# Coursework",
        "Data Structures, DBMS,",
        "Operating Systems",
    ]
    right = [
        "# Projects",
        "Placement Portal",
        "Built a placement portal using",
        "ReactJS and NodeJS. Students track",
        "drives and upload resumes.",
        "",
        "Hostel Expense Splitter",
        "Express.js API with MongoDB; settles",
        "debts in the fewest payments.",
        "",
        "# Experience",
        "Web Intern, CampusKart (2025)",
        "Wrote REST APIs and unit tests",
        "with Jest. Fixed SQL queries for",
        "the orders dashboard.",
    ]
    text_lines(c, 50, H - 135, left, size=10)
    text_lines(c, 250, H - 135, right, size=10)
    c.setFont("DejaVuB", 11)
    c.drawString(50, H - 380, "Tools I use")
    data = [["Area", "Tools"], ["Design", "Figma"], ["Testing", "Jest, Postman"], ["Data", "pandas, Excel"]]
    t = Table(data, colWidths=[110, 200])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "DejaVu", 9),
        ("FONT", (0, 0), (-1, 0), "DejaVuB", 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#aaaaaa")),
    ]))
    tw, th = t.wrapOn(c, W, H)
    t.drawOn(c, 50, H - 392 - th)
    c.save()


if __name__ == "__main__":
    two_column()
    table_skills()
    icons()
    scanned()
    mixed_pages()
    mixed_region()
    unreadable()
    sample_resume()
    print("Wrote fixtures to", FIX, "and sample to", PUB)
