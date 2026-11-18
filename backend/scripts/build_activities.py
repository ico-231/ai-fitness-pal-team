"""Sinh data/activities.json — danh mục "Hoạt động khác" (ngoài buổi gym).

MET theo 2024 Adult Compendium of Physical Activities (Herrmann và cộng sự, J Sport Health Sci 2024), đã đối chiếu
từng mã trên pacompendium.com ngày 17/11/2026. Mỗi hoạt động có MET cho 3 mức Nhẹ / Vừa / Mạnh (chọn theo "talk test"),
mã Compendium ghi theo đúng thứ tự đó; "~" = Compendium không có mã cho mức này → nội suy giữa 2 mức có mã.
Đi bộ / chạy / đạp xe / bơi có thêm bảng MET theo tốc độ (dùng khi người dùng nhập quãng đường).

Không có mục "tập tạ / gym": buổi gym đã tự tính calo từ WorkoutSession (tránh ghi trùng).

  python scripts/build_activities.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "activities.json"

CATEGORIES = {
    "di_bo": "Đi bộ & leo", "chay": "Chạy bộ", "dap_xe": "Đạp xe", "nuoc": "Bơi & chèo",
    "the_thao": "Thể thao", "ve_dep": "Yoga & nhảy", "vo": "Võ & đối kháng", "doi_song": "Việc nhà & đời sống",
}

# Bảng MET theo tốc độ: (km/h tối đa, MET) — quy đổi từ dải mph của Compendium 2024
WALK = [(3.2, 2.3), (3.9, 2.8), (4.4, 3.0), (5.5, 3.8), (6.3, 4.8), (7.1, 5.5), (7.9, 7.0), (9.0, 8.5), (11.1, 10.3), (99, 13.8)]
#        17151      17152      17170      17190      17200      17220      17230      17231      15525        15527
RUN = [(5.95, 3.3), (7.7, 7.8), (8.4, 8.5), (9.6, 9.0), (10.1, 9.3), (10.8, 10.5), (11.3, 11.0), (12.1, 11.8), (12.9, 12.0),
       (13.8, 12.5), (14.5, 13.0), (16.1, 14.8), (17.7, 16.8), (19.3, 18.5), (20.9, 19.8), (99, 23.0)]
#       12026 12029 12030 ~(9,0) 12050 12060 12070 12080 12090 12100 12110 12120 12130 12132 12134 12135
BIKE = [(16.0, 4.0), (19.2, 6.8), (22.4, 8.0), (25.6, 10.0), (30.6, 12.0), (99, 16.8)]
#        01010       01020       01030       01040        01050        01060
SWIM = [(1.8, 5.8), (2.8, 8.0), (99, 9.8)]
#        18240       18290       18230

# (id, tên, nhóm, icon, phổ biến, (MET nhẹ, vừa, mạnh), mã Compendium nhẹ / vừa / mạnh, từ đồng nghĩa, bảng tốc độ)
A = [
    # ---- Đi bộ & leo
    ("di_bo", "Đi bộ", "di_bo", "Footprints", True, (2.8, 3.8, 4.8), "17152 / 17190 / 17200",
     ["đi dạo", "đi bộ nhanh", "walking", "walk"], WALK),
    ("buoc_chan", "Bước chân cả ngày (đếm bước)", "di_bo", "Footprints", False, (3.5, 3.5, 3.5), "17160",
     ["số bước", "steps", "đếm bước", "bước"], None),
    ("leo_cau_thang", "Leo cầu thang", "di_bo", "TrendingUp", False, (4.5, 6.0, 9.3), "17133 / ~ / 17134",
     ["leo thang", "stairs", "cầu thang bộ"], None),
    ("leo_nui", "Leo núi / trekking", "di_bo", "Mountain", False, (3.8, 6.0, 7.8), "17081 / 17080 / 17012",
     ["trekking", "hiking", "đi phượt bộ", "leo núi bộ"], None),
    # ---- Chạy
    ("chay_bo", "Chạy bộ", "chay", "Footprints", True, (6.0, 7.5, 10.5), "12010 / 12020 / 12060",
     ["chạy", "running", "jogging", "chạy chậm"], RUN),
    ("chay_may", "Chạy máy (treadmill)", "chay", "Activity", False, (6.0, 7.5, 10.5), "12010 / 12020 / 12060",
     ["máy chạy bộ", "treadmill"], RUN),
    # ---- Đạp xe
    ("dap_xe", "Đạp xe", "dap_xe", "Bike", True, (4.3, 6.8, 10.0), "01015 / 01011 / 01040",
     ["xe đạp", "đi xe đạp", "bike", "cycling", "đạp xe đi học"], BIKE),
    ("xe_dap_tap", "Xe đạp tập tại chỗ", "dap_xe", "Bike", False, (4.0, 6.8, 9.0), "01214 / 01200 / 01270",
     ["xe đạp tĩnh", "spinning", "stationary bike"], None),
    # ---- Bơi & chèo
    ("boi", "Bơi", "nuoc", "Waves", True, (4.8, 6.0, 9.8), "18255 / 18310 / 18230",
     ["bơi lội", "swimming", "bơi sải", "bơi ngửa"], SWIM),
    ("boi_ech", "Bơi ếch", "nuoc", "Waves", False, (5.3, 7.5, 10.3), "18265 / ~ / 18260", ["breaststroke"], None),
    ("boi_vui_choi", "Bơi vui chơi / tắm biển", "nuoc", "Waves", False, (3.5, 6.0, 6.0), "18350 / 18300 / 18300",
     ["tắm biển", "nghịch nước"], None),
    ("cheo_thuyen", "Chèo thuyền / kayak", "nuoc", "Sailboat", False, (2.8, 5.0, 9.0), "18040 / 18100 / 18106",
     ["kayak", "chèo kayak", "canoe", "chèo thuyền"], None),
    ("sup", "Chèo SUP", "nuoc", "Sailboat", False, (4.0, 6.5, 8.0), "~ / 18224 / ~", ["sup", "stand up paddle"], None),
    ("may_cheo", "Máy chèo (rowing)", "nuoc", "Sailboat", False, (5.0, 7.5, 11.0), "02071 / 02072 / 02073",
     ["rowing machine", "máy chèo thuyền"], None),
    # ---- Thể thao
    ("cau_long", "Cầu lông", "the_thao", "Feather", True, (4.5, 5.5, 7.0), "~ / 15030 / 15020", ["badminton"], None),
    ("bong_da", "Bóng đá", "the_thao", "Trophy", True, (5.0, 7.0, 9.5), "~ / 15610 / 15605",
     ["đá bóng", "đá banh", "football", "soccer", "futsal", "bóng đá sân 5", "sân 7"], None),
    ("pickleball", "Pickleball", "the_thao", "Trophy", False, (4.0, 5.0, 6.0),
     "~ (Compendium 2024 chưa có mã riêng; tham chiếu Paddleball 15500 = 6,0)", ["pickle ball"], None),
    ("tennis", "Tennis", "the_thao", "Trophy", False, (6.0, 6.8, 8.0), "15680 / 15675 / 15690", ["quần vợt"], None),
    ("bong_ban", "Bóng bàn", "the_thao", "Trophy", False, (3.0, 4.0, 5.5), "~ / 15660 / ~", ["ping pong", "table tennis"], None),
    ("bong_ro", "Bóng rổ", "the_thao", "Trophy", False, (5.0, 7.5, 8.0), "15070 / 15055 / 15040", ["basketball"], None),
    ("bong_chuyen", "Bóng chuyền", "the_thao", "Trophy", False, (3.0, 4.0, 6.0), "15720 / 15710 / 15711",
     ["volleyball", "bóng chuyền bãi biển"], None),
    ("da_cau", "Đá cầu", "the_thao", "Feather", False, (3.0, 4.0, 5.5), "~ / 15310 (hacky sack) / ~", ["cầu đá"], None),
    ("golf", "Golf (đi bộ)", "the_thao", "Flag", False, (3.5, 4.3, 4.5), "15270 / 15265 / 15255", ["đánh golf"], None),
    ("truot_patin", "Trượt patin", "the_thao", "Activity", False, (7.0, 7.5, 9.8), "15590 / 15591 / 15592", ["roller", "patin", "skate"], None),
    ("nhay_day", "Nhảy dây", "the_thao", "Activity", False, (8.3, 11.8, 12.3), "15552 / 15551 / 15550", ["jump rope"], None),
    ("leo_tuong", "Leo núi trong nhà (bouldering)", "the_thao", "Mountain", False, (5.8, 8.0, 8.8), "15537 / 15533 / 15534",
     ["bouldering", "climbing", "leo tường"], None),
    # ---- Yoga & nhảy
    ("yoga", "Yoga / giãn cơ", "ve_dep", "Flower2", True, (2.3, 3.0, 4.0), "02150 / 02155 / 02160", ["giãn cơ", "stretching", "yoga"], None),
    ("pilates", "Pilates", "ve_dep", "Flower2", False, (1.8, 2.8, 3.5), "02103 / 02105 / ~", [], None),
    ("aerobic", "Aerobic / Zumba", "ve_dep", "Music", False, (4.8, 6.5, 8.0), "02005 / 02310 / 02006",
     ["zumba", "nhảy aerobic", "dance fitness"], None),
    ("nhay", "Nhảy (dance)", "ve_dep", "Music", False, (3.0, 5.5, 9.8), "03040 / 03030 / 03031",
     ["khiêu vũ", "dance", "nhảy hiện đại", "kpop dance"], None),
    ("the_duc_sang", "Thể dục buổi sáng / dưỡng sinh", "ve_dep", "Sunrise", False, (2.8, 3.8, 7.5), "02024 / 02022 / 02020",
     ["dưỡng sinh", "tập thể dục", "thái cực quyền", "tai chi"], None),
    ("hiit_tai_nha", "HIIT / circuit tại nhà (không tạ)", "ve_dep", "Timer", False, (3.5, 6.0, 11.0), "02034 / 02032 / 02214",
     ["hiit", "circuit", "burpee", "tabata"], None),
    # ---- Võ
    ("boxing", "Boxing / đấm bao", "vo", "Swords", False, (5.8, 7.3, 12.3), "15110 / 15457 / 15100",
     ["đấm bốc", "kickboxing", "đấm bao cát"], None),
    ("vo_thuat", "Võ thuật (Vovinam, Taekwondo, Karate...)", "vo", "Swords", False, (5.3, 7.8, 10.3), "15425 / ~ / 15430",
     ["vovinam", "taekwondo", "karate", "judo", "võ"], None),
    # ---- Việc nhà & đời sống
    ("viec_nha", "Việc nhà (dọn dẹp, lau nhà)", "doi_song", "Home", True, (2.5, 3.5, 3.8), "05023 / 05021 / 05012",
     ["dọn nhà", "lau nhà", "quét nhà"], None),
    ("lam_vuon", "Làm vườn", "doi_song", "Sprout", False, (2.0, 3.5, 5.0), "08066 / 08045 / 08050", ["trồng cây", "gardening"], None),
    ("be_con", "Bế / chơi với con nhỏ", "doi_song", "Baby", False, (2.3, 3.5, 5.8), "05170 / 05175 / 05180", ["trông con", "chơi với con"], None),
    ("khuan_vac", "Bê vác, chuyển đồ", "doi_song", "Package", False, (3.5, 5.8, 9.0), "05054 / 05120 / 05150",
     ["chuyển nhà", "bưng bê", "khuân vác"], None),
    ("dat_cho_di_dao", "Dắt chó đi dạo", "doi_song", "Dog", False, (2.5, 3.0, 3.8), "~ / 17165 / 17190", ["dắt chó"], None),
]


def build() -> list[dict]:
    out = []
    for (aid, name, cat, icon, popular, (lo, mid, hi), code, aliases, speed) in A:
        assert cat in CATEGORIES, aid
        assert lo <= mid <= hi, aid
        if speed:
            assert all(a[0] < b[0] and a[1] <= b[1] for a, b in zip(speed, speed[1:])), aid
        out.append({"id": aid, "name": name, "category": cat, "category_vi": CATEGORIES[cat], "icon": icon, "popular": popular,
                    "met": {"light": lo, "moderate": mid, "vigorous": hi}, "compendium": code, "aliases": aliases,
                    "speed_mets": [{"max_kmh": s, "met": m} for s, m in speed] if speed else None,
                    "distance": bool(speed), "steps": aid == "buoc_chan"})
    assert len({x["id"] for x in out}) == len(out)
    return out


if __name__ == "__main__":
    data = {"version": "Compendium 2024 (đối chiếu 17/11/2026)", "categories": CATEGORIES, "items": build()}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(data['items'])} hoạt động vào {OUT.name} ({sum(x['popular'] for x in data['items'])} hay dùng)")
